/**
 * @fileoverview Core service for translating content using OpenAI's language models.
 *
 * Handles the entire translation workflow including content parsing, language detection,
 * model interaction, response processing, and metrics tracking.
 */

import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { encodingForModel } from "js-tiktoken";
import OpenAI from "openai";
import { APIError } from "openai/error";

import type { LanguageConfig } from "./language-detector.service.ts";

import type { ProxyHandlerOptions } from "@/errors/";

import { createErrorHandlingProxy, ErrorCode, ErrorHandler, TranslationError } from "@/errors/";
import { detectRateLimit, env, MAX_CHUNK_TOKENS } from "@/utils/";

import { LanguageDetector } from "./language-detector.service";

/** Represents a file that needs to be translated */
export class TranslationFile {
	constructor(
		/** The content of the file */
		public readonly content: string,

		/** The filename of the file */
		public readonly filename: string,

		/** The path of the file */
		public readonly path: string,

		/** The SHA of the file */
		public readonly sha: string,
	) {}
}

/**
 * Core service for translating content using OpenAI's language models.
 *
 * Handles the entire translation workflow including:
 * - Content parsing and block management
 * - Language model interaction with async language detection
 * - Response processing and cleanup
 * - Translation metrics tracking
 * - Language analysis and detection
 *
 * @example
 * ```typescript
 * const translator = new TranslatorService({ source: 'en', target: 'pt' });
 * translator.setGlossary('React -> React\ncomponent -> componente');
 *
 * const result = await translator.translateContent(file);
 * console.log(result); // Translated content
 * ```
 */
export class TranslatorService {
	/** Language model instance for translation */
	private readonly llm = new OpenAI({
		baseURL: env.OPENAI_BASE_URL,
		apiKey: env.OPENAI_API_KEY,
		project: env.OPENAI_PROJECT_ID,
		defaultHeaders: {
			"X-Title": env.HEADER_APP_TITLE,
			"HTTP-Referer": env.HEADER_APP_URL,
		},
	});

	public readonly languageDetector: LanguageDetector;

	public glossary: string | null = null;

	/** Error handler for logging and managing translation errors */
	private readonly errorHandler = ErrorHandler.getInstance();

	/**
	 * Initializes the translator service with language configuration and error handling.
	 *
	 * Sets up the OpenAI client, language detector, and comprehensive error handling
	 * with automatic retry logic for rate limits and API errors.
	 *
	 * @param options Language configuration for translation workflow
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt' });
	 * translator.setGlossary('React -> React\ncomponent -> componente');
	 * ```
	 */
	public constructor(private readonly options: LanguageConfig) {
		this.languageDetector = new LanguageDetector(this.options);

		const errorMap: ProxyHandlerOptions["errorMap"] = new Map();

		/**
		 * Generic error transform that checks for rate limit patterns in any error
		 */
		const genericErrorTransform = (error: Error) => {
			if (detectRateLimit(error.message)) {
				return {
					code: ErrorCode.RATE_LIMIT_EXCEEDED,
					metadata: {
						originalMessage: error.message,
						errorType: error.constructor.name,
					},
				};
			}

			return {
				metadata: {
					originalMessage: error.message,
					errorType: error.constructor.name,
				},
			};
		};

		errorMap.set("APIError", {
			code: ErrorCode.LLM_API_ERROR,
			transform: (error: Error) => {
				if (error instanceof APIError) {
					if (detectRateLimit(error.message, error.status)) {
						return {
							code: ErrorCode.RATE_LIMIT_EXCEEDED,
							metadata: {
								statusCode: error.status,
								type: error.type,
								originalMessage: error.message,
							},
						};
					}
					return {
						metadata: {
							statusCode: error.status,
							type: error.type,
							originalMessage: error.message,
						},
					};
				}

				return genericErrorTransform(error);
			},
		});

		errorMap.set("Error", {
			code: ErrorCode.UNKNOWN_ERROR,
			transform: genericErrorTransform,
		});

		errorMap.set("RateLimitError", { code: ErrorCode.RATE_LIMIT_EXCEEDED });
		errorMap.set("QuotaExceededError", { code: ErrorCode.RATE_LIMIT_EXCEEDED });
		errorMap.set("TooManyRequestsError", { code: ErrorCode.RATE_LIMIT_EXCEEDED });

		this.llm = createErrorHandlingProxy(this.llm, { serviceName: "OpenAI", errorMap });
	}

	/**
	 * Main translation method that processes files and manages the translation workflow.
	 *
	 * Automatically handles large files through intelligent chunking while preserving
	 * markdown structure and code blocks. Uses token estimation to determine if
	 * content needs to be split into manageable pieces.
	 *
	 * ### Workflow
	 *
	 * 1. Validates input content
	 * 2. Determines if chunking is needed based on token estimates
	 * 3. Translates content (with chunking if necessary)
	 * 4. Cleans up and returns translated content
	 * 5. Updates metrics
	 *
	 * @param file File containing content to translate
	 *
	 * @returns Promise resolving to translated content
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const file = new TranslationFile(
	 *   '# Hello\n\nWelcome to React!',
	 *   'hello.md',
	 *   'docs/hello.md',
	 *   'abc123'
	 * );
	 * const translated = await translator.translateContent(file);
	 * console.log(translated); // '# Olá\n\nBem-vindo ao React!'
	 * ```
	 */
	public async translateContent(file: TranslationFile): Promise<string> {
		if (!file.content?.length) {
			throw new Error(`File content is empty: ${file.filename}`);
		}

		const translatedContent = await this.translateWithChunking(file.content);

		return this.cleanupTranslatedContent(translatedContent, file.content);
	}

	/**
	 * Determines if content is already translated by analyzing its language composition.
	 * Uses async language detection and scoring to make the determination.
	 *
	 * @param file File containing content to analyze
	 *
	 * @returns Resolves to `true` if content is already translated
	 */
	public async isContentTranslated(file: TranslationFile): Promise<boolean> {
		if (!file.content?.length) return false;

		try {
			const analysis = await this.languageDetector.analyzeLanguage(file.filename, file.content);

			return analysis.isTranslated;
		} catch (error) {
			this.errorHandler.handle(error as Error, {
				operation: "isTranslationComplete",
				metadata: {
					filename: file.filename,
					contentLength: file.content?.length || 0,
				},
			});
			return false;
		}
	}

	/**
	 * Gets detailed language analysis for debugging and metrics.
	 *
	 * @param file File to analyze
	 *
	 * @returns Resolves to the detailed language analysis
	 */
	public async getLanguageAnalysis(file: TranslationFile) {
		if (!file.content?.length) {
			throw new Error(`File content is empty: ${file.filename}`);
		}

		return await this.languageDetector.analyzeLanguage(file.filename, file.content);
	}

	/**
	 * Estimates token count for content using tiktoken encoding.
	 *
	 * Uses the actual tokenization model to provide accurate token counts
	 * for the specific LLM being used. This is crucial for proper chunking
	 * and avoiding API limits.
	 *
	 * @param content Content to estimate tokens for
	 *
	 * @returns Accurate token count using model-specific encoding
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const tokenCount = translator.estimateTokenCount('# Hello World\n\nWelcome!');
	 * console.log(tokenCount); // ~8 tokens
	 * ```
	 */
	private estimateTokenCount(content: string): number {
		try {
			const encoding = encodingForModel("gpt-4o-mini");
			const tokens = encoding.encode(content);
			return tokens.length;
		} catch {
			return Math.ceil(content.length / 3.5);
		}
	}

	/**
	 * Determines if content needs chunking based on token estimates.
	 *
	 * Checks if the estimated token count exceeds safe limits, leaving buffer
	 * space for system prompt (approximately 1000 tokens) and output tokens
	 * (approximately 8000 tokens).
	 *
	 * @param content Content to check for chunking requirements
	 *
	 * @returns True if content exceeds safe token limits and needs chunking
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const needsChunking = translator.needsChunking(largeContent);
	 * if (needsChunking) {
	 *   console.log('Content will be split into chunks');
	 * }
	 * ```
	 */
	private needsChunking(content: string): boolean {
		const estimatedTokens = this.estimateTokenCount(content);
		const maxInputTokens = MAX_CHUNK_TOKENS - 1000;
		return estimatedTokens > maxInputTokens;
	}

	/**
	 * Splits content into chunks while preserving markdown structure.
	 *
	 * Uses LangChain's MarkdownTextSplitter for intelligent chunking that respects
	 * markdown structure and code blocks, ensuring chunks don't exceed the maximum
	 * token limit while maintaining content coherence and readability.
	 *
	 * @param content Content to split into manageable chunks
	 * @param maxTokens Maximum tokens per chunk (defaults to safe limit)
	 *
	 * @returns Promise resolving to array of content chunks with preserved markdown structure
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const largeContent = '# Title\n\n```js\ncode here\n```\n\nMore content...';
	 * const chunks = await translator.chunkContent(largeContent, 1000);
	 * console.log(chunks.length); // Number of chunks created
	 * ```
	 */
	private async chunkContent(
		content: string,
		maxTokens = MAX_CHUNK_TOKENS - 500,
	): Promise<string[]> {
		if (!this.needsChunking(content)) {
			return [content];
		}

		const splitter = new MarkdownTextSplitter({
			chunkSize: maxTokens,
			chunkOverlap: 200,
			lengthFunction: (text: string) => this.estimateTokenCount(text),
		});

		const chunks = await splitter.splitText(content);
		return chunks.filter((chunk) => chunk.trim().length > 0);
	}

	/**
	 * Translates content using chunking if necessary.
	 *
	 * Handles large files by breaking them into manageable pieces and processing
	 * each chunk separately. Automatically reassembles the translated chunks while
	 * maintaining proper spacing and structure.
	 *
	 * @param content Content to translate (may be chunked if large)
	 *
	 * @returns Promise resolving to translated content reassembled from chunks
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const largeContent = 'Very long documentation content...';
	 * const translated = await translator.translateWithChunking(largeContent);
	 * console.log('Translation completed successfully');
	 * ```
	 */
	private async translateWithChunking(content: string): Promise<string> {
		const contentNeedsChunking = this.needsChunking(content);

		if (!contentNeedsChunking) {
			return await this.callLanguageModel(content);
		}

		const chunks = await this.chunkContent(content);
		const translatedChunks: string[] = [];

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i]!;

			try {
				const translatedChunk = await this.callLanguageModel(chunk);
				translatedChunks.push(translatedChunk);
			} catch (error) {
				throw new TranslationError(
					`Failed to translate content chunk ${i + 1}/${chunks.length}`,
					ErrorCode.LLM_API_ERROR,
					{
						operation: "translateWithChunking",
						metadata: {
							chunkIndex: i,
							totalChunks: chunks.length,
							chunkSize: chunk.length,
							estimatedTokens: this.estimateTokenCount(chunk),
							originalError: error instanceof Error ? error.message : String(error),
						},
					},
				);
			}
		}

		return translatedChunks.join("\n\n");
	}

	/**
	 * Sends content to the language model for translation.
	 * Constructs system and user prompts based on detected language.
	 *
	 * @param content Content to translate
	 *
	 * @returns Resolves to the translated content
	 */
	private async callLanguageModel(content: string): Promise<string> {
		const systemPrompt = await this.getSystemPrompt(content);
		const userPrompt = this.getUserPrompt(content);

		try {
			const completion = await this.llm.chat.completions.create({
				model: env.LLM_MODEL,
				temperature: 0.1,
				max_tokens: env.MAX_TOKENS,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
			});

			const translatedContent = completion.choices[0]?.message?.content;

			if (!translatedContent) {
				throw new Error("No content returned from language model");
			}

			return translatedContent;
		} catch (error) {
			/**
			 * Handle OpenAI-specific errors that may not be caught by the proxy
			 * due to nested method calls (this.llm.chat.completions.create)
			 */
			if (error instanceof Error) {
				const errorType = error.constructor.name;

				/**
				 * Direct mapping for known OpenAI error types
				 */
				if (
					errorType === "RateLimitError" ||
					errorType === "QuotaExceededError" ||
					errorType === "TooManyRequestsError"
				) {
					throw new TranslationError(error.message, ErrorCode.RATE_LIMIT_EXCEEDED, {
						operation: "callLanguageModel",
						metadata: {
							model: env.LLM_MODEL,
							errorType,
							originalMessage: error.message,
						},
					});
				}

				/**
				 * Fallback pattern matching for rate limit errors
				 */
				if (detectRateLimit(error.message)) {
					throw new TranslationError(error.message, ErrorCode.RATE_LIMIT_EXCEEDED, {
						operation: "callLanguageModel",
						metadata: {
							model: env.LLM_MODEL,
							errorType,
							originalMessage: error.message,
						},
					});
				}
			}

			/**
			 * Re-throw the error for upper-level error handling
			 */
			throw error;
		}
	}

	/**
	 * Removes common artifacts from translation output.
	 *
	 * @param translatedContent Content returned from the language model
	 * @param originalContent Original content before translation
	 *
	 * @returns Cleaned translated content
	 */
	private cleanupTranslatedContent(translatedContent: string, originalContent: string): string {
		let cleaned = translatedContent;

		const prefixes = [
			"Here is the translation:",
			"Here's the translation:",
			"Translation:",
			"Translated content:",
			"Here is the translated content:",
			"Here's the translated content:",
		];

		for (const prefix of prefixes) {
			if (cleaned.trim().toLowerCase().startsWith(prefix.toLowerCase())) {
				cleaned = cleaned.substring(prefix.length).trim();
			}
		}

		cleaned = cleaned.trim();

		if (originalContent.includes("\r\n")) {
			cleaned = cleaned.replace(/\n/g, "\r\n");
		}

		return cleaned;
	}

	/**
	 * Creates user prompt with the content to translate.
	 *
	 * @param content Content to translate
	 *
	 * @returns User prompt string
	 */
	private getUserPrompt(content: string): string {
		return `CONTENT TO TRANSLATE:\n${content}\n\n`;
	}

	/**
	 * Creates the system prompt that defines translation rules and requirements.
	 * Uses async language detection to determine source language.
	 *
	 * @param content Content to determine source language
	 *
	 * @returns Resolves to the system prompt string
	 */
	private async getSystemPrompt(content: string): Promise<string> {
		const detectedSourceCode = await this.languageDetector.detectPrimaryLanguage(content);

		const languages = {
			target: this.languageDetector.getLanguageName(this.options.target) || "Portuguese",
			source:
				detectedSourceCode ?
					this.languageDetector.getLanguageName(detectedSourceCode) || "English"
				:	"English",
		};

		const glossarySection = `
			GLOSSARY RULES:
			You must translate the following terms according to the glossary:
			${this.glossary}`;

		return `
			You are a precise translator specializing in technical documentation. 
			Your task is to translate React documentation from ${languages.source} to ${languages.target} in a single, high-quality pass.

			TRANSLATION AND VERIFICATION REQUIREMENTS — YOU MUST FOLLOW THESE EXACTLY:
			- MUST maintain ALL original markdown formatting, including code blocks, links, and special syntax
			- MUST preserve ALL original code examples EXACTLY as they are
			- MUST keep ALL original HTML tags intact and unchanged
			- MUST follow the glossary rules below STRICTLY — these are non-negotiable terms
			- MUST maintain ALL original frontmatter EXACTLY as in original
			- MUST preserve ALL original line breaks and paragraph structure
			- MUST NOT translate code variables, function names, or technical terms not in the glossary
			- MUST NOT add any content
			- MUST NOT remove any content. This is very important, DO NOT DO IT!
			- MUST NOT change any URLs or links
			- MUST translate comments within code blocks according to the glossary
			- MUST maintain consistent technical terminology throughout the translation
			- MUST ensure the translation reads naturally in ${languages.target} while preserving technical accuracy
			- When translating code blocks, MUST only translate comments and string literals that don't refer to code
			- MUST respond only with the translated content.
			- MUST make sure the output text content is not preppended or appended with any extra characters or text (sometimes LLMs add "\`\`\`" at the start or end)
			- MUST NOT add whitespace to lists or between list items and their bullets/numbers (e.g. "- item", "1. item"; NOT "-item", "1.item" or "-  item", "1.  item")
			- MUST NOT wrap the translated content in a code block (sometimes LLMs do this even when instructed not to)
			- MUST NOT remove the original frontmatter at the start of the document (the section between "---" lines)
			- MUST keep the same number of blank lines as the original content
			- MUST keep the blank line at the end of a file if it is present in the original content
			${languages.target === "Português (Brasil)" ? "- MUST translate 'deprecated' and derived terms to 'descontinuado(a)' or 'obsoleto(a)'" : ""}

			${glossarySection}
		`;
	}
}
