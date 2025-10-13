/**
 * @fileoverview Core service for translating content using OpenAI's language models.
 *
 * Handles the entire translation workflow including content parsing, language detection,
 * model interaction, response processing, and metrics tracking.
 */

import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { encodingForModel } from "js-tiktoken";
import OpenAI from "openai";

import type { LanguageConfig } from "./language-detector.service.ts";

import { GithubErrorHelper, LLMErrorHelper } from "@/errors/";
import { env, logger, MAX_CHUNK_TOKENS } from "@/utils/";

import { LanguageDetectorService } from "./language-detector.service";

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

	private readonly helpers = {
		llm: new LLMErrorHelper(),
		github: new GithubErrorHelper(),
	};

	public readonly languageDetector: LanguageDetectorService;

	public glossary: string | null = null;

	/**
	 * Initializes the translator service with language configuration.
	 *
	 * Sets up the OpenAI client and language detector for translation workflow.
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
		this.languageDetector = new LanguageDetectorService(this.options);
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

			logger.debug(
				{
					filename: file.filename,
					isTranslated: analysis.isTranslated,
					detectedLanguage: analysis.detectedLanguage,
				},
				"Checked translation status",
			);

			return analysis.isTranslated;
		} catch (error) {
			logger.error(
				{
					error,
					filename: file.filename,
					contentLength: file.content?.length || 0,
				},
				"Error checking if content is translated - assuming not translated",
			);

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
	 * Uses LangChain's {@link MarkdownTextSplitter} for intelligent chunking that respects
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
				logger.debug(
					{
						chunkIndex: i + 1,
						totalChunks: chunks.length,
						chunkSize: chunk.length,
					},
					"Translating content chunk",
				);

				const translatedChunk = await this.callLanguageModel(chunk);
				translatedChunks.push(translatedChunk);

				logger.info(
					{
						chunkIndex: i + 1,
						totalChunks: chunks.length,
						translatedSize: translatedChunk.length,
					},
					"Chunk translated successfully",
				);
			} catch (error) {
				logger.error(
					{
						error,
						chunkIndex: i + 1,
						totalChunks: chunks.length,
					},
					"Failed to translate content chunk",
				);

				throw this.helpers.llm.mapError(error, {
					operation: "TranslatorService.translateWithChunking",
					metadata: {
						chunkIndex: i,
						totalChunks: chunks.length,
						chunkSize: chunk.length,
						estimatedTokens: this.estimateTokenCount(chunk),
					},
				});
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

		try {
			logger.debug(
				{
					model: env.LLM_MODEL,
					contentLength: content.length,
					temperature: 0.1,
				},
				"Calling language model for translation",
			);

			const completion = await this.llm.chat.completions.create({
				model: env.LLM_MODEL,
				temperature: 0.1,
				max_tokens: env.MAX_TOKENS,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content },
				],
			});

			const translatedContent = completion.choices[0]?.message?.content;

			if (!translatedContent) {
				logger.error({ model: env.LLM_MODEL }, "No content returned from language model");
				throw new LLMErrorHelper().mapError(new Error("No content returned from language model"), {
					operation: "TranslatorService.callLanguageModel",
					metadata: {
						model: env.LLM_MODEL,
						contentLength: content.length,
					},
				});
			}

			logger.info(
				{
					model: env.LLM_MODEL,
					translatedLength: translatedContent.length,
					tokensUsed: completion.usage?.total_tokens,
				},
				"Translation completed successfully",
			);

			return translatedContent;
		} catch (error) {
			throw this.helpers.llm.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
				metadata: {
					model: env.LLM_MODEL,
					contentLength: content.length,
				},
			});
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
	 * Creates the system prompt that defines translation rules and requirements.
	 * Uses async language detection to determine source language and constructs
	 * a structured prompt following prompt engineering best practices.
	 *
	 * @param content Content to determine source language
	 *
	 * @returns Resolves to the system prompt string
	 */
	private async getSystemPrompt(content: string): Promise<string> {
		const detectedSourceCode = await this.languageDetector.detectPrimaryLanguage(content);

		const languages = {
			target: this.languageDetector.getLanguageName(this.options.target) || "Brazilian Portuguese",
			source:
				detectedSourceCode ?
					this.languageDetector.getLanguageName(detectedSourceCode) || "English"
				:	"English",
		};

		const glossarySection =
			this.glossary ?
				`\n## TERMINOLOGY GLOSSARY\nApply these exact translations for the specified terms:\n${this.glossary}\n`
			:	"";

		const langSpecificRules = this.getLanguageSpecificRules(languages.target);

		return `# ROLE
You are an expert technical translator specializing in React documentation.

# TASK
Translate the provided content from ${languages.source} to ${languages.target} with absolute precision and technical accuracy.

# CRITICAL PRESERVATION RULES
1. **Structure & Formatting**: Preserve ALL markdown syntax, HTML tags, code blocks, frontmatter, and line breaks exactly as written
2. **Code Integrity**: Keep ALL code examples, variable names, function names, and URLs COMPLETELY unchanged
3. **Content Completeness**: Translate EVERY piece of text content WITHOUT adding, removing, or omitting anything

# TRANSLATION GUIDELINES
## What to Translate
- Natural language text and documentation content
- Code comments and string literals (when they contain user-facing text)
- Alt text, titles, and descriptive content

## What NOT to Translate
- Code syntax, variable names, function names, API endpoints
- Technical terms not specified in the glossary
- URLs, file paths, or configuration values
- Frontmatter keys (only translate values if they're user-facing)

## Quality Standards
- Use natural, fluent ${languages.target} while maintaining technical precision
- Apply consistent terminology throughout the document
- Ensure technical accuracy and clarity for developers

# OUTPUT REQUIREMENTS
- Return ONLY the translated content
- Do NOT add explanatory text, code block wrappers, or prefixes
- Maintain exact whitespace patterns, including list formatting and blank lines
- Preserve any trailing newlines from the original content

${langSpecificRules}

${glossarySection}`;
	}

	/**
	 * Gets language-specific translation rules based on the target language.
	 *
	 * @param targetLanguage The target language name
	 *
	 * @returns Language-specific rules or empty string
	 */
	private getLanguageSpecificRules(targetLanguage: string): string {
		if (targetLanguage === "Português (Brasil)") {
			return `\n# PORTUGUESE (BRAZIL) SPECIFIC RULES
- Translate 'deprecated' and related terms to 'descontinuado(a)' or 'obsoleto(a)'
- Use Brazilian Portuguese conventions and terminology`;
		}
		return "";
	}
}
