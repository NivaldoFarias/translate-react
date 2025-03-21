import { franc } from "franc";
import OpenAI from "openai";
import { APIError } from "openai/error";

import type { ProxyHandlerOptions } from "@/errors/proxy.handler";
import type { LanguageConfig } from "@/utils/language-detector.util";

import { ErrorCode } from "@/errors/base.error";
import { createErrorHandlingProxy } from "@/errors/proxy.handler";
import { LanguageDetector } from "@/utils/language-detector.util";
import { TranslationFile } from "@/utils/translation-file.util";

/**
 * # Translation Service
 *
 * Core service for translating content using OpenAI's language models.
 * Handles the entire translation workflow including:
 * - Content parsing and block management
 * - Language model interaction
 * - Response processing
 * - Metrics tracking
 */
export class TranslatorService {
	/** Language model instance for translation */
	private readonly llm = new OpenAI({
		baseURL: import.meta.env.OPENAI_BASE_URL,
		apiKey: import.meta.env.OPENAI_API_KEY,
		project: import.meta.env.OPENAI_PROJECT_ID,
		defaultHeaders: {
			"X-Title": import.meta.env.HEADER_APP_TITLE,
			"HTTP-Referer": import.meta.env.HEADER_APP_URL,
		},
	});

	private readonly languageDetector: LanguageDetector;

	public glossary: string | null = null;

	/**
	 * Initializes the translator service with the given language configuration
	 *
	 * @param options Language configuration for translation
	 */
	public constructor(private readonly options: LanguageConfig) {
		this.languageDetector = new LanguageDetector({
			source: this.options.source,
			target: this.options.target,
		});

		const errorMap: ProxyHandlerOptions["errorMap"] = new Map();

		errorMap.set("APIError", {
			code: ErrorCode.LLM_API_ERROR,
			transform: (error: Error) => {
				if (error instanceof APIError) {
					return { metadata: { statusCode: error.status, type: error.type } };
				}

				return { metadata: { statusCode: 500, type: "UnknownError" } };
			},
		});
		errorMap.set("RateLimitError", { code: ErrorCode.RATE_LIMIT_EXCEEDED });

		this.llm = createErrorHandlingProxy(this.llm, { serviceName: "OpenAI", errorMap });
	}

	/**
	 * Main translation method that processes files and manages the translation workflow
	 *
	 * ## Workflow
	 * 1. Validates input content
	 * 2. Parses content (without modifying code blocks)
	 * 3. Calls language model for translation
	 * 4. Returns translated content
	 * 5. Updates metrics
	 *
	 * @param file File containing content to translate
	 */
	public async translateContent(file: TranslationFile) {
		if (!file.content?.length) {
			throw new Error(`File content is empty: ${file.filename}`);
		}

		const content = await this.callLanguageModel(file.content);

		return this.cleanupTranslatedContent(content, file.content);
	}

	/**
	 * Determines if content is already translated by analyzing its language composition.
	 * Uses language detection and scoring to make the determination.
	 *
	 * @param file File containing content to analyze
	 *
	 * @returns `true` if content is in target language, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * const isTranslated = detector.isFileTranslated('Olá mundo');
	 * ```
	 */
	public isFileTranslated(file: TranslationFile) {
		const analysis = this.languageDetector.analyzeLanguage(file.filename, file.content);

		return analysis.isTranslated;
	}

	/**
	 * Makes API calls to OpenAI for content translation.
	 * Constructs appropriate prompts and handles response processing.
	 *
	 * @param content Main content to translate
	 *
	 * @returns Translated content from the language model
	 */
	private async callLanguageModel(content: string): Promise<string> {
		const response = (await this.llm.chat.completions.create({
			model: import.meta.env.LLM_MODEL,
			messages: this.createPrompt(content),
		})) as OpenAI.Chat.Completions.ChatCompletion | { error: { message: string } };

		if ("error" in response) {
			throw new Error(response.error.message);
		}

		if (response.choices[0]?.finish_reason === "length") {
			return this.chunkAndRetryTranslation(content);
		}

		let translatedContent = response.choices[0]?.message.content;
		if (!translatedContent) {
			throw new Error("No content returned");
		}

		return translatedContent;
	}

	/**
	 * Creates the messages array for the language model
	 *
	 * @param content Main content to translate
	 */
	private createPrompt(content: string) {
		return [
			{
				role: "system" as const,
				content: this.getSystemPrompt(content),
			},
			{
				role: "user" as const,
				content: this.getUserPrompt(content),
			},
		];
	}

	/**
	 * For some reason, some LLMs return the content with fences prepended and appended.
	 * This method removes them.
	 */
	public cleanupTranslatedContent(content: string, originalContent?: string) {
		const shouldStartWith = `---\ntitle:`;
		const endTicks = "```";

		if (!content.startsWith(shouldStartWith)) {
			content = content.replace(/^[\s\S]*?(?=---\ntitle:)/, "");
		}

		if (content.endsWith(endTicks) && !originalContent?.endsWith(endTicks)) {
			const regex = new RegExp(`\n${endTicks}$`);

			content = content.replace(regex, "");
		}

		return content;
	}

	/**
	 * Creates the user prompt for the language model.
	 * Includes instructions for content translation and block handling.
	 *
	 * @param content Content to be translated
	 */
	private getUserPrompt(content: string) {
		return `CONTENT TO TRANSLATE:\n${content}\n\n`;
	}

	/**
	 * Creates the system prompt that defines translation rules and requirements.
	 * Includes language specifications, formatting rules, and glossary.
	 *
	 * @param content Content to determine source language
	 */
	private getSystemPrompt(content: string) {
		const languages = {
			target: this.languageDetector.detectLanguage(this.options.target)?.["1"] || "Portuguese",
			source: this.languageDetector.detectLanguage(franc(content))?.["1"] || "English",
		};

		if (languages.target === "Portuguese") {
			languages.target = "Brazilian Portuguese";
		}

		return `
			You are a precise translator specializing in technical documentation. 
			Your task is to translate React documentation from ${languages.source} to ${languages.target} in a single, high-quality pass.

			TRANSLATION AND VERIFICATION REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:
			1. MUST maintain ALL original markdown formatting, including code blocks, links, and special syntax
			2. MUST preserve ALL original code examples exactly as they are
			3. MUST keep ALL original HTML tags intact and unchanged
			4. MUST follow the glossary rules below STRICTLY - these are non-negotiable terms
			5. MUST maintain ALL original frontmatter exactly as in original
			6. MUST preserve ALL original line breaks and paragraph structure
			7. MUST NOT translate code variables, function names, or technical terms not in the glossary
			8. MUST NOT add any content
			9. MUST NOT remove any content. This is very important, DO NOT DO IT!
			10. MUST NOT change any URLs or links
			11. MUST translate comments within code blocks according to the glossary
			12. MUST maintain consistent technical terminology throughout the translation
			13. MUST ensure the translation reads naturally in ${languages.target} while preserving technical accuracy
			14. When translating code blocks, MUST only translate comments and string literals that don't refer to code
			15. MUST respond only with the translated content.
			
			GLOSSARY RULES:
			You must translate the following terms according to the glossary:
			${this.glossary}
		`;
	}

	/**
	 * Handles content that exceeds the model's context window by splitting it into
	 * smaller chunks and translating each chunk separately, then combining the results.
	 *
	 * ## Workflow
	 * 1. Splits content at natural break points (middle of paragraphs, end of code blocks)
	 * 2. Recursively splits chunks that are still too large
	 * 3. Translates each chunk while maintaining context
	 * 4. Combines translated chunks preserving original structure
	 *
	 * @param content Content that exceeded the model's context window
	 *
	 * @returns Combined translated content from all chunks
	 *
	 * @throws {Error} If chunking fails or if all chunk translation attempts fail
	 */
	public async chunkAndRetryTranslation(content: string) {
		const chunks = this.splitIntoSections(content);

		return this.cleanupTranslatedContent(await this.translateChunks(chunks));
	}

	/**
	 * Translates the content of the chunks.
	 *
	 * ## Workflow
	 * 1. Adds context about chunking to help maintain consistency
	 * 2. Translates each chunk
	 * 3. Removes the part prefix if it exists in the response
	 * 4. Combines the translated chunks
	 *
	 * @param chunks The chunks to translate
	 *
	 * @returns The translated content
	 */
	private async translateChunks(chunks: Array<string>) {
		const chunkContext = (index: number, total: number) => `PART ${index + 1} OF ${total}:\n\n`;

		const translatedChunks: Array<string> = [];

		for (const [index, chunk] of chunks.entries()) {
			try {
				const translatedChunk = await this.callLanguageModel(
					chunkContext(index + 1, chunks.length) + chunk,
				);

				translatedChunks.push(this.cleanupTranslatedContent(translatedChunk, chunk));
			} catch (error) {
				if (error instanceof Error && error.message === "Content is too long") {
					const furtherChunkedTranslation = await this.chunkAndRetryTranslation(chunk);

					translatedChunks.push(furtherChunkedTranslation);
				} else {
					throw error;
				}
			}
		}

		return translatedChunks.join("");
	}

	/**
	 * Splits content at a natural break point closest to the middle.
	 * Finds logical boundaries like paragraph breaks, code blocks, or headers
	 * that are nearest to the middle of the content.
	 *
	 * ## Workflow
	 * 1. Identifies natural break points (paragraph breaks, end of code blocks, headers)
	 * 2. Finds the break point closest to the middle of the content
	 * 3. Returns the content split at that point
	 *
	 * @param content Content to split
	 *
	 * @returns Array containing two parts of the content, split at a natural break
	 */
	private splitIntoSections(content: string): Array<string> {
		if (content.length < 1000) return [content];

		const midpoint = Math.floor(content.length / 2);

		const breakPointRegex = /(\n\n)|(\n#{1,6} )|(\n```\n)|(```\n)/g;

		let bestBreakPoint = 0;
		let minDistance = content.length;
		let match;

		breakPointRegex.lastIndex = 0;

		while ((match = breakPointRegex.exec(content)) !== null) {
			const breakPointPosition = match.index + match[0].length;
			const distance = Math.abs(breakPointPosition - midpoint);
			const exceededSearchBoundary = breakPointPosition > midpoint * 1.5;

			// If the distance is smaller than the minimum distance,
			// update the minimum distance and the best break point
			if (distance < minDistance) {
				minDistance = distance;
				bestBreakPoint = breakPointPosition;
			}

			if (exceededSearchBoundary) break;
		}

		// If no good break point was found, use the midpoint
		if (bestBreakPoint === 0) {
			// Try to find a sentence break near the midpoint
			const sentenceBreakRegex = /[.!?]\s+/g;
			sentenceBreakRegex.lastIndex = midpoint - 200 > 0 ? midpoint - 200 : 0;

			// Try to find a sentence break near the midpoint
			while ((match = sentenceBreakRegex.exec(content)) !== null) {
				const breakPointPosition = match.index + match[0].length;
				const distance = Math.abs(breakPointPosition - midpoint);
				const exceededSearchBoundary = breakPointPosition > midpoint + 200;

				if (distance < minDistance) {
					minDistance = distance;
					bestBreakPoint = breakPointPosition;
				}

				if (exceededSearchBoundary) break;
			}

			// If still no good break point, use the midpoint at a space
			if (bestBreakPoint === 0) {
				// Find the nearest space to the midpoint
				let left = midpoint;
				let right = midpoint;

				while (left > 0 || right < content.length) {
					if (left > 0) {
						left--;
						if (content[left] === " " || content[left] === "\n") {
							bestBreakPoint = left + 1;
							break;
						}
					}

					if (right < content.length) {
						if (content[right] === " " || content[right] === "\n") {
							bestBreakPoint = right + 1;
							break;
						}
						right++;
					}
				}
			}
		}

		// If we still couldn't find a break point, just use the midpoint
		if (bestBreakPoint === 0) {
			bestBreakPoint = midpoint;
		}

		// Split the content at the best break point
		return [content.substring(0, bestBreakPoint), content.substring(bestBreakPoint)];
	}
}
