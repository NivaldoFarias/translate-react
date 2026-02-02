import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { StatusCodes } from "http-status-codes";
import { encodingForModel } from "js-tiktoken";
import OpenAI from "openai";
import { APIError } from "openai/error";
import pRetry, { AbortError } from "p-retry";

import type { MarkdownTextSplitterParams } from "@langchain/textsplitters";
import type PQueue from "p-queue";
import type { Options as RetryOptions } from "p-retry";

import { llmQueue, openai } from "@/clients/";
import { ApplicationError, ErrorCode } from "@/errors/";
import { env, extractDocTitleFromContent, logger, MAX_CHUNK_TOKENS } from "@/utils/";

import { LanguageDetectorService, languageDetectorService } from "./language-detector.service";
import { localeService, LocaleService } from "./locale";

/** Dependency injection interface for TranslatorService */
export interface TranslatorServiceDependencies {
	/** OpenAI client instance for LLM API calls */
	openai: OpenAI;

	/** LLM model identifier for chat completions */
	model: string;

	/** Rate limiting queue for LLM API calls */
	queue: PQueue;

	/** Optional locale service (defaults to singleton) */
	localeService: LocaleService;

	/** Optional language detector service */
	languageDetectorService: LanguageDetectorService;

	/** Retry configuration for LLM API calls */
	retryConfig: RetryOptions;
}

/**
 * Result of content chunking operation containing chunks and their separators.
 *
 * The separators array contains the exact whitespace patterns that existed
 * between each pair of chunks in the original content, enabling perfect
 * reassembly that preserves the source formatting.
 */
interface ChunkingResult {
	/** Array of content chunks split from the original text */
	chunks: string[];

	/**
	 * Array of separator strings between chunks.
	 *
	 * Length is always `chunks.length - 1` since there's one separator
	 * between each pair of adjacent chunks. Each separator is the exact
	 * whitespace pattern (e.g., `\n`, `\n\n`, `\n\n\n`) extracted from
	 * the original content at that boundary position.
	 */
	separators: string[];
}

/** Represents a file that needs to be translated */
export class TranslationFile {
	/** The title of the document extracted from frontmatter */
	public readonly title: string | undefined;

	constructor(
		/** The content of the file */
		public readonly content: string,

		/** The filename of the file */
		public readonly filename: string,

		/** The path of the file */
		public readonly path: string,

		/** The SHA of the file */
		public readonly sha: string,
	) {
		this.title = extractDocTitleFromContent(content);
	}
}

/**
 * Core service for translating content using {@link OpenAI}.
 *
 * @example
 * ```typescript
 * const translator = new TranslatorService({
 *   openai:  new OpenAI(),
 *   model: 'gpt-4o',
 * });
 *
 * const result = await translator.translateContent(file);
 * console.log(result); // Translated content
 * ```
 */
export class TranslatorService {
	private readonly logger = logger.child({ component: TranslatorService.name });

	/** OpenAI client instance for LLM API calls */
	private readonly openai: OpenAI;

	/** LLM model identifier for chat completions */
	private readonly model: string;

	/** Rate limiting queue for LLM API calls */
	private readonly queue: PQueue;

	/** Retry configuration for LLM API calls */
	private readonly retryConfig: RetryOptions;

	public readonly services: {
		/** Locale service for language-specific rules */
		locale: LocaleService;

		/** Language detector for content analysis */
		languageDetector: LanguageDetectorService;
	};

	/** Glossary for consistent term translations */
	public glossary: string | null = null;

	/**
	 * Creates a new TranslatorService instance with injected dependencies.
	 *
	 * @param dependencies Dependency injection container with OpenAI client, rate limiter, and configuration
	 */
	constructor(dependencies: TranslatorServiceDependencies) {
		this.openai = dependencies.openai;
		this.model = dependencies.model;
		this.queue = dependencies.queue;
		this.services = {
			locale: dependencies.localeService,
			languageDetector: dependencies.languageDetectorService,
		};
		this.retryConfig = dependencies.retryConfig;
	}

	/**
	 * Tests LLM API connectivity and authentication.
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.InitializationError} If LLM API is not accessible or credentials are invalid
	 *
	 * @example
	 * ```typescript
	 * await TranslatorService.testConnectivity();
	 * console.log("✅ LLM API is healthy");
	 * ```
	 */
	public async testConnectivity(): Promise<void> {
		const response = await this.openai.chat.completions.create({
			model: this.model,
			messages: [{ role: "user", content: "ping" }],
			max_tokens: 5,
			temperature: 0.1,
		});

		if (!this.isLLMResponseValid(response)) {
			throw new ApplicationError(
				"Invalid LLM API response",
				ErrorCode.InitializationError,
				`${TranslatorService.name}.${this.testConnectivity.name}`,
				{ response },
			);
		}

		this.logger.info(
			{
				model: this.model,
				response: {
					id: response.id,
					usage: response.usage,
					message: response.choices[0]?.message,
				},
			},
			"LLM API connectivity test successful",
		);
	}

	private isLLMResponseValid(response: OpenAI.Chat.Completions.ChatCompletion): boolean {
		return !!response.id || !!response.usage?.total_tokens || !!response.choices.at(0)?.message;
	}

	/**
	 * Main translation method that processes files and manages the translation workflow.
	 *
	 * Automatically handles large files through intelligent chunking while preserving
	 * markdown structure and code blocks. Uses token estimation to determine if
	 * content needs to be split into manageable pieces. Includes post-translation
	 * validation to ensure content integrity.
	 *
	 * ### Workflow
	 *
	 * 1. Validates input content
	 * 2. Determines if chunking is needed based on token estimates
	 * 3. Translates content (with chunking if necessary)
	 * 4. Validates translation completeness
	 * 5. Cleans up and returns translated content
	 * 6. Updates metrics
	 *
	 * @param file File containing content to translate
	 *
	 * @returns Promise resolving to translated content
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.NoContent} if file's content is empty
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
		this.logger.info({ file }, "Translating content for file");

		if (!file.content.length) {
			this.logger.error({ fileContent: file.content.length }, "File content is empty");

			throw new ApplicationError(
				`File content is empty: ${file.filename}`,
				ErrorCode.NoContent,
				`${TranslatorService.name}.${this.translateContent.name}`,
				{ filename: file.filename, path: file.path },
			);
		}

		const translationStartTime = Date.now();
		let translatedContent: string;

		const contentNeedsChunking = this.needsChunking(file.content);
		if (!contentNeedsChunking) {
			translatedContent = await this.callLanguageModel(file.content);
		} else {
			translatedContent = await this.translateWithChunking(file.content);
		}

		const translationDuration = Date.now() - translationStartTime;

		this.validateTranslation(file, translatedContent);

		this.logger.info(
			{
				filename: file.filename,
				originalLength: file.content.length,
				translatedLength: translatedContent.length,
				durationMs: translationDuration,
				sizeRatio: (translatedContent.length / file.content.length).toFixed(2),
			},
			"Translation completed successfully",
		);

		return this.cleanupTranslatedContent(translatedContent, file.content);
	}

	/**
	 * Validates translated content to ensure completeness and quality.
	 *
	 * Performs a comprehensive set of validation checks to catch potential translation
	 * issues before committing to the repository. This multi-layered validation approach
	 * helps prevent incomplete translations, structural corruption, and content loss.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.FormatValidationFailed} if validation checks fail (empty content, complete heading loss)
	 *
	 * @example
	 * ```typescript
	 * const file = new TranslationFile('# Title\nContent', 'doc.md', 'path', 'sha');
	 * const translated = '# Título\nConteúdo';
	 * validateTranslation(file, translated); // Passes all checks
	 * ```
	 */
	private validateTranslation(file: TranslationFile, translatedContent: string): void {
		if (!translatedContent || translatedContent.trim().length === 0) {
			this.logger.error(
				{ filename: file.filename, translatedContent },
				"Translated content is empty",
			);

			throw new ApplicationError(
				"Translation produced empty content",
				ErrorCode.FormatValidationFailed,
				`${TranslatorService.name}.${this.validateTranslation.name}`,
				{
					filename: file.filename,
					path: file.path,
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
			);
		}

		const sizeRatio = translatedContent.length / file.content.length;
		if (sizeRatio < 0.5 || sizeRatio > 2.0) {
			this.logger.warn(
				{
					filename: file.filename,
					sizeRatio: sizeRatio.toFixed(2),
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
				"Translation size ratio outside expected range (0.5-2.0)",
			);
		}

		const CATCH_HEADINGS_REGEX = /^#{1,6}\s/gm;
		const originalHeadings = (file.content.match(CATCH_HEADINGS_REGEX) ?? []).length;
		const translatedHeadings = (translatedContent.match(CATCH_HEADINGS_REGEX) ?? []).length;
		const headingRatio = translatedHeadings / originalHeadings;

		this.logger.debug(
			{ originalHeadings, translatedHeadings, headingRatio, regex: CATCH_HEADINGS_REGEX },
			`Heading counts for ${file.filename}`,
		);

		if (originalHeadings === 0) {
			this.logger.warn("Original file contains no markdown headings. Skipping heading validation");
			return;
		}

		if (translatedHeadings === 0) {
			this.logger.error(
				{ filename: file.filename, originalHeadings, translatedHeadings },
				"Translation lost all markdown headings",
			);

			throw new ApplicationError(
				"All markdown headings lost during translation",
				ErrorCode.FormatValidationFailed,
				`${TranslatorService.name}.${this.validateTranslation.name}`,
				{
					path: file.path,
					originalHeadings,
					translatedHeadings,
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
			);
		} else if (headingRatio < 0.8 || headingRatio > 1.2) {
			this.logger.warn(
				{
					filename: file.filename,
					originalHeadings,
					translatedHeadings,
					headingRatio: headingRatio.toFixed(2),
				},
				"Significant heading count mismatch detected",
			);
		}

		this.logger.debug(
			{
				filename: file.filename,
				sizeRatio: sizeRatio.toFixed(2),
				originalHeadings,
				translatedHeadings,
			},
			"Translation validation passed",
		);
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
		try {
			this.logger.info({ filename: file.filename }, "Checking if content is already translated");

			const analysis = await this.getLanguageAnalysis(file);

			this.logger.info({ analysis }, "Checked translation status");

			return analysis.isTranslated;
		} catch (error) {
			this.logger.error(
				{ error },
				"Error checking if content is translated. Assuming not translated",
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
		if (!file.content.length) {
			this.logger.error(
				{ filename: file.filename, path: file.path, contentLength: file.content.length },
				"File content is empty",
			);

			throw new ApplicationError(
				"File content is empty",
				ErrorCode.NoContent,
				`${TranslatorService.name}.${this.getLanguageAnalysis.name}`,
				{ filename: file.filename, path: file.path, contentLength: file.content.length },
			);
		}

		const analysis = await this.services.languageDetector.analyzeLanguage(
			file.filename,
			file.content,
		);

		this.logger.info({ analysis }, "Analyzed language of content");

		return analysis;
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
		} catch (error) {
			const fallback = Math.ceil(content.length / 3.5);
			this.logger.error({ error }, "Error estimating token count, using fallback");

			return fallback;
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
	 * Splits content into chunks while preserving exact separators between chunks.
	 *
	 * Uses LangChain's {@link MarkdownTextSplitter} for intelligent chunking that respects
	 * markdown structure and code blocks. After splitting, this method analyzes the
	 * original content to detect and preserve the exact whitespace pattern (separator)
	 * that exists between each pair of chunks, enabling perfect reassembly that maintains
	 * the source document's formatting.
	 *
	 * @param content Content to split into manageable chunks for translation
	 * @param maxTokens Maximum tokens per chunk, defaults to safe limit accounting for prompt overhead
	 *
	 * @returns Result object containing chunk array and separator array for reassembly
	 *
	 * @see {@link translateWithChunking} for usage in translation workflow
	 * @see {@link MarkdownTextSplitter} from LangChain for splitting implementation
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService();
	 * const content = '# Title\n\nContent\n\n## Section\n\nMore...';
	 * const result = await translator.chunkContent(content);
	 *
	 * console.log(result.chunks.length);    	// 3
	 * console.log(result.separators.length); // 2
	 * console.log(result.separators[0]);     // '\n\n'
	 * ```
	 */
	private async chunkContent(
		content: string,
		maxTokens = MAX_CHUNK_TOKENS - 500,
	): Promise<ChunkingResult> {
		const markdownTextSplitterOptions: Partial<MarkdownTextSplitterParams> = {
			chunkSize: maxTokens,
			chunkOverlap: 200,
			lengthFunction: (text: string) => this.estimateTokenCount(text),
		};

		const splitter = new MarkdownTextSplitter(markdownTextSplitterOptions);

		const rawChunks = await splitter.splitText(content);
		const chunks = rawChunks.filter((chunk) => chunk.trim().length > 0);

		const separators: string[] = [];

		/**
		 * Detect the actual separator between each pair of chunks by finding
		 * where each chunk appears in the original content and extracting the
		 * whitespace between them.
		 */
		let searchStartIndex = 0;

		for (let index = 0; index < chunks.length - 1; index++) {
			const currentChunk = chunks[index];
			const nextChunk = chunks[index + 1];

			if (currentChunk == null || nextChunk == null) {
				throw new ApplicationError(
					"Encountered null or undefined chunk while computing separators",
					ErrorCode.ChunkProcessingFailed,
					`${TranslatorService.name}.${this.chunkContent.name}`,
					{ index, chunksLength: chunks.length },
				);
			}

			if (!currentChunk.trim() || !nextChunk.trim()) {
				this.logger.warn(
					{ index, chunksLength: chunks.length },
					"TranslatorService: encountered empty chunk while computing separators",
				);
				separators.push("\n\n");
				continue;
			}
			const currentChunkIndex = content.indexOf(currentChunk.trim(), searchStartIndex);

			if (currentChunkIndex === -1) {
				separators.push("\n\n");
				continue;
			}

			const currentChunkEnd = currentChunkIndex + currentChunk.trim().length;

			const nextChunkIndex = content.indexOf(nextChunk.trim(), currentChunkEnd);

			if (nextChunkIndex === -1) {
				separators.push("\n\n");
				continue;
			}

			const separator = content.substring(currentChunkEnd, nextChunkIndex);
			separators.push(separator);

			searchStartIndex = nextChunkIndex;
		}

		return { chunks, separators };
	}

	/**
	 * Translates content using intelligent chunking for large files.
	 *
	 * Handles large files by breaking them into manageable pieces and processing
	 * each chunk separately. Automatically reassembles the translated chunks while
	 * maintaining proper spacing and structure. Includes comprehensive validation
	 * to ensure all chunks are successfully translated before reassembly.
	 *
	 * @param content Content to translate (automatically chunked if exceeds token limit)
	 *
	 * @returns Promise resolving to translated content reassembled from all chunks
	 *
	 * @see {@link chunkContent} for chunking strategy details
	 * @see {@link callLanguageModel} for individual chunk translation
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const largeContent = '# Very long documentation...\n'.repeat(1000);
	 * const translated = await translator.translateWithChunking(largeContent);
	 * console.log('Translation completed:', translated.length);
	 * ```
	 */
	private async translateWithChunking(content: string): Promise<string> {
		const { chunks, separators } = await this.chunkContent(content);

		const translatedChunks = await Promise.all(
			chunks.map((chunk, index) => this.translateChunk(chunk, index, chunks)),
		);

		return this.validateAndReassembleChunks(content, {
			original: chunks,
			translated: translatedChunks,
			separators,
		});
	}

	/**
	 * Validates that all chunks were successfully translated and reassembles them.
	 * Ensures that the number of translated chunks matches the original chunk count.
	 *
	 * ### Reassembly Strategy
	 *
	 * Chunks are joined with a single newline character (`\n`) rather than double newlines.
	 * This is because the chunking process already ensures that each chunk (except the last)
	 * ends with a trailing newline. Using a single newline as the separator preserves the
	 * original spacing and prevents the introduction of extra blank lines between sections.
	 *
	 * @param content Original content before translation
	 * @param chunks Chunks object containing original and translated chunks along with separators
	 * @param chunks.original Original content chunks
	 * @param chunks.translated Translated content chunks
	 * @param chunks.separators Separators used between chunks during reassembly
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.ChunkProcessingFailed} if chunk count mismatch is detected
	 *
	 * @returns Reassembled translated content
	 */
	private validateAndReassembleChunks(
		content: string,
		chunks: { original: string[]; translated: string[]; separators: string[] },
	): string {
		if (chunks.translated.length !== chunks.original.length) {
			this.logger.error(
				{
					expectedChunks: chunks.original.length,
					actualChunks: chunks.translated.length,
					missingChunks: chunks.original.length - chunks.translated.length,
				},
				"Chunk count mismatch detected",
			);

			throw new ApplicationError(
				`Chunk count mismatch. Expected ${chunks.original.length} chunks, but only ${chunks.translated.length} were translated`,
				ErrorCode.ChunkProcessingFailed,
				`${TranslatorService.name}.${this.translateWithChunking.name}`,
				{
					expectedChunks: chunks.original.length,
					actualChunks: chunks.translated.length,
					missingChunks: chunks.original.length - chunks.translated.length,
					contentLength: content.length,
					chunkSizes: chunks.original.map((chunk) => chunk.length),
				},
			);
		}

		let reassembledContent = chunks.translated.reduce((accumulator, chunk, index) => {
			return accumulator + chunk + (chunks.separators[index] ?? "");
		}, "");

		const originalEndsWithNewline = content.endsWith("\n");
		const translatedEndsWithNewline = reassembledContent.endsWith("\n");

		if (originalEndsWithNewline && !translatedEndsWithNewline) {
			const TRAILING_NEWLINES_REGEX = /\n+$/;
			const originalTrailingNewlines = TRAILING_NEWLINES_REGEX.exec(content)?.[0] ?? "";
			reassembledContent += originalTrailingNewlines;

			this.logger.debug(
				{ addedTrailingNewlines: originalTrailingNewlines.length },
				"Restored trailing newlines from original content",
			);
		}

		this.logger.debug(
			{
				originalLength: content.length,
				reassembledLength: reassembledContent.length,
				compressionRatio: (reassembledContent.length / content.length).toFixed(2),
			},
			"Content reassembly completed",
		);

		return reassembledContent;
	}

	private async translateChunk(chunk: string, _index: number, _chunks: string[]): Promise<string> {
		return this.callLanguageModel(chunk);
	}

	/**
	 * Prepares parameters for LLM chat completion API call.
	 *
	 * @param content Content to translate
	 *
	 * @returns Chat completion parameters object
	 */
	private async getLLMCompletionParams(
		content: string,
	): Promise<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> {
		return {
			model: this.model,
			temperature: 0.1,
			max_tokens: env.MAX_TOKENS,
			messages: [
				{ role: "system", content: await this.getSystemPrompt(content) },
				{ role: "user", content },
			],
		};
	}

	/**
	 * Sends content to the language model for translation.
	 *
	 * Constructs system and user prompts based on detected language.
	 * Automatically applies rate limiting to prevent exceeding API limits,
	 * especially important for free-tier LLM models with strict rate limits.
	 *
	 * @param content Content to translate
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.TranslationFailed} if the translation's content is missing/empty
	 *
	 * @returns Resolves to the translated content
	 */
	private async callLanguageModel(content: string): Promise<string> {
		return this.queue.add(async () => {
			return pRetry(
				async () => {
					try {
						this.logger.debug({ contentLength: content.length, model: this.model }, "Calling LLM");

						const completion = await this.openai.chat.completions.create(
							await this.getLLMCompletionParams(content),
						);

						const translatedContent = completion.choices[0]?.message.content;

						if (!translatedContent) {
							throw new ApplicationError(
								"No content returned from language model",
								ErrorCode.NoContent,
								`${TranslatorService.name}.${this.callLanguageModel.name}`,
								{ model: this.model, contentLength: content.length },
							);
						}

						return translatedContent;
					} catch (error) {
						if (
							error instanceof APIError &&
							(error.status === StatusCodes.UNAUTHORIZED ||
								error.status === StatusCodes.BAD_REQUEST)
						) {
							throw new AbortError(error);
						}

						throw error;
					}
				},
				{
					...this.retryConfig,
					onFailedAttempt: ({ attemptNumber: attempt, error, retriesLeft }) => {
						this.logger.warn(
							{ attempt, retriesLeft, error: error.message },
							"LLM call failed, retrying",
						);
					},
				},
			);
		});
	}

	/**
	 * Removes common artifacts from translation output.
	 *
	 * Strips common LLM response prefixes like "Here is the translation:"
	 * and converts line endings to match original content format
	 *
	 * @param translatedContent Content returned from the language model
	 * @param originalContent Original content before translation (used for line ending detection)
	 *
	 * @returns Cleaned translated content with artifacts removed
	 *
	 * @example
	 * ```typescript
	 * const translated = 'Here is the translation:\n\nActual content...';
	 * const cleaned = cleanupTranslatedContent(translated, original);
	 * console.log(cleaned); // 'Actual content...'
	 * ```
	 */
	private cleanupTranslatedContent(translatedContent: string, originalContent: string): string {
		this.logger.debug(
			{ translatedContentLength: translatedContent.length },
			"Cleaning up translated content",
		);

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

		this.logger.debug(
			{ originalContentLength: originalContent.length, cleanedContentLength: cleaned.length },
			"Adjusting line endings to match original content",
		);

		if (originalContent.includes("\r\n")) {
			cleaned = cleaned.replace(/\n/g, "\r\n");
		}

		this.logger.debug(
			{ cleanedContentLength: cleaned.length },
			"Translated content cleanup completed",
		);

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
		this.logger.debug("Generating system prompt for translation");

		const detectedSourceCode = await this.services.languageDetector.detectPrimaryLanguage(content);

		const languages = {
			target: this.services.languageDetector.getLanguageName(
				LanguageDetectorService.languages.target,
			),
			source: this.services.languageDetector.getLanguageName(
				detectedSourceCode ?? LanguageDetectorService.languages.source,
				false,
			),
		};

		this.logger.debug(
			{ detectedSourceCode, languages },
			"Determined source and target languages for prompt",
		);

		const glossarySection =
			this.glossary ?
				`\n## TERMINOLOGY GLOSSARY\nApply these exact translations for the specified terms:\n${this.glossary}\n`
			:	"";

		const builtSystemPrompt = `# ROLE
				You are an expert technical translator specializing in React documentation.
	
				# TASK
				Translate the provided content from ${languages.source} to ${languages.target} with absolute precision and technical accuracy.
	
				# CRITICAL PRESERVATION RULES
				1. **Structure & Formatting**: Preserve ALL markdown syntax, HTML tags, code blocks, frontmatter, and line breaks exactly as written
				2. **Code Integrity**: Keep ALL code examples, variable names, function names, and URLs COMPLETELY unchanged
				3. **Content Completeness**: Translate EVERY piece of text content WITHOUT adding, removing, or omitting anything
				4. **Whitespace Integrity**: ALWAYS preserve blank lines, especially after horizontal rules (---). The pattern '---\n\n##' must remain '---\n\n##' and never become '---\n##'
	
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
	
				${this.services.locale.definitions.rules.specific}
	
				${glossarySection}
			`;

		return builtSystemPrompt;
	}
}

/** Pre-configured instance of {@link TranslatorService} for application-wide use */
export const translatorService = new TranslatorService({
	openai,
	model: env.LLM_MODEL,
	queue: llmQueue,
	localeService,
	languageDetectorService,
	retryConfig: {
		retries: env.MAX_RETRY_ATTEMPTS,
	},
});
