import crypto from "node:crypto";

import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { StatusCodes } from "http-status-codes";
import { encodingForModel } from "js-tiktoken";
import OpenAI from "openai";
import { APIError } from "openai/error";
import pRetry, { AbortError } from "p-retry";

import type { MarkdownTextSplitterParams } from "@langchain/textsplitters";
import type PQueue from "p-queue";
import type { Options as RetryOptions } from "p-retry";
import type { Logger } from "pino";

import { openai, queue } from "@/clients/";
import { ApplicationError, ErrorCode } from "@/errors/";
import { LanguageDetectorService, languageDetectorService } from "@/services/language-detector/";
import { localeService, LocaleService } from "@/services/locale/";
import { env, extractDocTitleFromContent, logger } from "@/utils/";

import {
	CHUNK_OVERLAP,
	CHUNK_TOKEN_BUFFER,
	CODE_BLOCK_REGEX,
	CONNECTIVITY_TEST_MAX_TOKENS,
	FRONTMATTER_KEY_REGEX,
	FRONTMATTER_REGEX,
	HEADINGS_REGEX,
	LINE_ENDING_REGEX,
	LLM_TEMPERATURE,
	MARKDOWN_LINK_REGEX,
	MAX_CHUNK_TOKENS,
	MAX_CODE_BLOCK_RATIO,
	MAX_HEADING_RATIO,
	MAX_LINK_RATIO,
	MAX_SIZE_RATIO,
	MIN_CODE_BLOCK_RATIO,
	MIN_HEADING_RATIO,
	MIN_LINK_RATIO,
	MIN_SIZE_RATIO,
	REQUIRED_FRONTMATTER_KEYS,
	SYSTEM_PROMPT_TOKEN_RESERVE,
	TOKEN_ESTIMATION_FALLBACK_DIVISOR,
	TRAILING_NEWLINES_REGEX,
	TRANSLATION_PREFIXES,
} from "./translator.constants";

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

	/** Logger instance with file-specific context for workflow tracing */
	public readonly logger: Logger;

	/** Correlation ID for end-to-end tracing across the file's workflow */
	public readonly correlationId: string;

	constructor(
		/** The content of the file */
		public readonly content: string,

		/** The filename of the file */
		public readonly filename: string,

		/** The path of the file */
		public readonly path: string,

		/** The SHA of the file */
		public readonly sha: string,

		/** Optional parent logger to create child logger from (defaults to root logger) */
		parentLogger?: Logger,
	) {
		this.title = extractDocTitleFromContent(content);
		this.correlationId = crypto.randomUUID();
		this.logger = (parentLogger ?? logger).child({
			file: this.filename,
			path: this.path,
			correlationId: this.correlationId,
		});
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
			max_tokens: CONNECTIVITY_TEST_MAX_TOKENS,
			temperature: LLM_TEMPERATURE,
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
		file.logger.info({ file }, "Translating content for file");

		if (!file.content.length) {
			file.logger.error({ fileContent: file.content.length }, "File content is empty");

			throw new ApplicationError(
				`File content is empty: ${file.filename}`,
				ErrorCode.NoContent,
				`${TranslatorService.name}.${this.translateContent.name}`,
				{ filename: file.filename, path: file.path },
			);
		}

		const translationStartTime = Date.now();
		let translatedContent: string;

		const contentNeedsChunking = this.needsChunking(file);
		if (!contentNeedsChunking) {
			translatedContent = await this.callLanguageModel(file);
		} else {
			translatedContent = await this.translateWithChunking(file);
		}

		const translationDuration = Date.now() - translationStartTime;

		this.validateTranslation(file, translatedContent);

		file.logger.info(
			{
				filename: file.filename,
				originalLength: file.content.length,
				translatedLength: translatedContent.length,
				durationMs: translationDuration,
				sizeRatio: (translatedContent.length / file.content.length).toFixed(2),
			},
			"Translation completed successfully",
		);

		return this.cleanupTranslatedContent(translatedContent, file);
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
			file.logger.error(
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
		if (sizeRatio < MIN_SIZE_RATIO || sizeRatio > MAX_SIZE_RATIO) {
			file.logger.warn(
				{
					filename: file.filename,
					sizeRatio: sizeRatio.toFixed(2),
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
				`Translation size ratio outside expected range (${MIN_SIZE_RATIO}-${MAX_SIZE_RATIO})`,
			);
		}

		const originalHeadings = (file.content.match(HEADINGS_REGEX) ?? []).length;
		const translatedHeadings = (translatedContent.match(HEADINGS_REGEX) ?? []).length;
		const headingRatio = translatedHeadings / originalHeadings;

		file.logger.debug(
			{ originalHeadings, translatedHeadings, headingRatio, regex: HEADINGS_REGEX },
			`Heading counts for ${file.filename}`,
		);

		if (originalHeadings === 0) {
			file.logger.warn("Original file contains no markdown headings. Skipping heading validation");
			return;
		}

		if (translatedHeadings === 0) {
			file.logger.error(
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
		} else if (headingRatio < MIN_HEADING_RATIO || headingRatio > MAX_HEADING_RATIO) {
			file.logger.warn(
				{
					filename: file.filename,
					originalHeadings,
					translatedHeadings,
					headingRatio: headingRatio.toFixed(2),
				},
				"Significant heading count mismatch detected",
			);
		}

		this.validateCodeBlockPreservation(file, translatedContent);
		this.validateLinkPreservation(file, translatedContent);
		this.validateFrontmatterIntegrity(file, translatedContent);

		file.logger.debug(
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
	 * Validates that code blocks are preserved during translation.
	 *
	 * Compares the count of fenced code blocks (triple backticks) between source
	 * and translated content. Logs a warning if there's a significant mismatch
	 * (>20% difference), as this may indicate code blocks were corrupted or removed.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateCodeBlockPreservation(file: TranslationFile, translatedContent: string): void {
		const originalCodeBlocks = (file.content.match(CODE_BLOCK_REGEX) ?? []).length;
		const translatedCodeBlocks = (translatedContent.match(CODE_BLOCK_REGEX) ?? []).length;

		file.logger.debug(
			{ originalCodeBlocks, translatedCodeBlocks },
			`Code block counts for ${file.filename}`,
		);

		if (originalCodeBlocks === 0) {
			file.logger.debug("Original file contains no code blocks. Skipping code block validation");
			return;
		}

		const codeBlockRatio = translatedCodeBlocks / originalCodeBlocks;

		if (codeBlockRatio < MIN_CODE_BLOCK_RATIO || codeBlockRatio > MAX_CODE_BLOCK_RATIO) {
			file.logger.warn(
				{
					filename: file.filename,
					originalCodeBlocks,
					translatedCodeBlocks,
					codeBlockRatio: codeBlockRatio.toFixed(2),
				},
				"Significant code block count mismatch detected - code blocks may have been corrupted or removed",
			);
		}
	}

	/**
	 * Validates that markdown links are preserved during translation.
	 *
	 * Compares the count of markdown links between source and translated content.
	 * Logs a warning if there's a significant mismatch (>20% difference), as this
	 * may indicate links were broken or removed during translation.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateLinkPreservation(file: TranslationFile, translatedContent: string): void {
		const originalLinks = (file.content.match(MARKDOWN_LINK_REGEX) ?? []).length;
		const translatedLinks = (translatedContent.match(MARKDOWN_LINK_REGEX) ?? []).length;

		file.logger.debug(
			{ originalLinks, translatedLinks },
			`Markdown link counts for ${file.filename}`,
		);

		if (originalLinks === 0) {
			file.logger.debug("Original file contains no markdown links. Skipping link validation");
			return;
		}

		const linkRatio = translatedLinks / originalLinks;

		if (linkRatio < MIN_LINK_RATIO || linkRatio > MAX_LINK_RATIO) {
			file.logger.warn(
				{
					filename: file.filename,
					originalLinks,
					translatedLinks,
					linkRatio: linkRatio.toFixed(2),
				},
				"Significant markdown link count mismatch detected - links may have been broken or removed",
			);
		}
	}

	/**
	 * Validates that frontmatter structure and required keys are preserved during translation.
	 *
	 * Parses YAML frontmatter from source and translated content, then verifies that:
	 * 1. Required keys (e.g., `title`) are preserved in translation
	 * 2. The overall frontmatter structure remains intact
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateFrontmatterIntegrity(file: TranslationFile, translatedContent: string): void {
		const originalFrontmatter = FRONTMATTER_REGEX.exec(file.content)?.[1];
		const translatedFrontmatter = FRONTMATTER_REGEX.exec(translatedContent)?.[1];

		if (!originalFrontmatter) {
			file.logger.debug("Original file contains no frontmatter. Skipping frontmatter validation");
			return;
		}

		if (!translatedFrontmatter) {
			file.logger.warn(
				{ filename: file.filename },
				"Frontmatter lost during translation - original had frontmatter but translation does not",
			);
			return;
		}

		const extractKeys = (content: string): Set<string> => {
			const keys = new Set<string>();
			let match: RegExpExecArray | null;

			const regex = new RegExp(FRONTMATTER_KEY_REGEX.source, FRONTMATTER_KEY_REGEX.flags);
			while ((match = regex.exec(content)) !== null) {
				if (match[1]) keys.add(match[1]);
			}
			return keys;
		};

		const originalKeys = extractKeys(originalFrontmatter);
		const translatedKeys = extractKeys(translatedFrontmatter);

		file.logger.debug(
			{
				originalKeys: [...originalKeys],
				translatedKeys: [...translatedKeys],
			},
			`Frontmatter keys for ${file.filename}`,
		);

		const missingRequiredKeys = REQUIRED_FRONTMATTER_KEYS.filter(
			(key) => originalKeys.has(key) && !translatedKeys.has(key),
		);

		if (missingRequiredKeys.length > 0) {
			file.logger.warn(
				{
					filename: file.filename,
					missingRequiredKeys,
					originalKeys: [...originalKeys],
					translatedKeys: [...translatedKeys],
				},
				"Required frontmatter keys missing in translation",
			);
		}

		const missingKeys = [...originalKeys].filter((key) => !translatedKeys.has(key));

		if (missingKeys.length > 0 && missingKeys.some((key) => !missingRequiredKeys.includes(key))) {
			const nonRequiredMissing = missingKeys.filter((key) => !missingRequiredKeys.includes(key));
			file.logger.warn(
				{
					filename: file.filename,
					missingKeys: nonRequiredMissing,
				},
				"Some frontmatter keys missing in translation",
			);
		}
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
			const fallback = Math.ceil(content.length / TOKEN_ESTIMATION_FALLBACK_DIVISOR);
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
	private needsChunking(file: TranslationFile): boolean {
		const estimatedTokens = this.estimateTokenCount(file.content);
		const maxInputTokens = MAX_CHUNK_TOKENS - SYSTEM_PROMPT_TOKEN_RESERVE;
		const needsChunking = estimatedTokens > maxInputTokens;

		file.logger.debug(
			{ estimatedTokens, maxInputTokens, needsChunking, contentLength: file.content.length },
			needsChunking ?
				"Content exceeds token limit, chunking required"
			:	"Content within token limit, no chunking needed",
		);

		return needsChunking;
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
		maxTokens = MAX_CHUNK_TOKENS - CHUNK_TOKEN_BUFFER,
	): Promise<ChunkingResult> {
		const markdownTextSplitterOptions: Partial<MarkdownTextSplitterParams> = {
			chunkSize: maxTokens,
			chunkOverlap: CHUNK_OVERLAP,
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
	private async translateWithChunking(file: TranslationFile): Promise<string> {
		file.logger.debug({ contentLength: file.content.length }, "Starting chunked translation");

		const { chunks, separators } = await this.chunkContent(file.content);

		file.logger.debug(
			{
				chunkCount: chunks.length,
				chunkSizes: chunks.map((c) => c.length),
				separatorCount: separators.length,
			},
			"Content split into chunks",
		);

		const translatedChunks = await Promise.all(
			chunks.map((chunk, index) => this.translateChunk(file, chunk, index, chunks)),
		);

		file.logger.debug(
			{ translatedChunkCount: translatedChunks.length },
			"All chunks translated, reassembling",
		);

		return this.validateAndReassembleChunks(file, {
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
		file: TranslationFile,
		chunks: { original: string[]; translated: string[]; separators: string[] },
	): string {
		if (chunks.translated.length !== chunks.original.length) {
			file.logger.error(
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
					contentLength: file.content.length,
					chunkSizes: chunks.original.map((chunk) => chunk.length),
				},
			);
		}

		let reassembledContent = chunks.translated.reduce((accumulator, chunk, index) => {
			return accumulator + chunk + (chunks.separators[index] ?? "");
		}, "");

		const originalEndsWithNewline = file.content.endsWith("\n");
		const translatedEndsWithNewline = reassembledContent.endsWith("\n");

		if (originalEndsWithNewline && !translatedEndsWithNewline) {
			const originalTrailingNewlines = TRAILING_NEWLINES_REGEX.exec(file.content)?.[0] ?? "";
			reassembledContent += originalTrailingNewlines;

			file.logger.debug(
				{ addedTrailingNewlines: originalTrailingNewlines.length },
				"Restored trailing newlines from original content",
			);
		}

		file.logger.debug(
			{
				originalLength: file.content.length,
				reassembledLength: reassembledContent.length,
				compressionRatio: (reassembledContent.length / file.content.length).toFixed(2),
			},
			"Content reassembly completed",
		);

		return reassembledContent;
	}

	private async translateChunk(
		file: TranslationFile,
		chunk: string,
		index: number,
		chunks: string[],
	): Promise<string> {
		const startTime = Date.now();
		const estimatedTokens = this.estimateTokenCount(chunk);

		file.logger.debug(
			{
				chunkIndex: index + 1,
				totalChunks: chunks.length,
				chunkSize: chunk.length,
				estimatedTokens,
			},
			`Translating chunk ${index + 1}/${chunks.length}`,
		);

		const translatedChunk = await this.callLanguageModel(file, chunk);

		file.logger.debug(
			{
				chunkIndex: index + 1,
				totalChunks: chunks.length,
				originalSize: chunk.length,
				translatedSize: translatedChunk.length,
				durationMs: Date.now() - startTime,
			},
			`Chunk ${index + 1}/${chunks.length} translation complete`,
		);

		return translatedChunk;
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
			temperature: LLM_TEMPERATURE,
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
	 * @param file File instance for logger context
	 * @param content Content to translate (defaults to file.content if not provided)
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.TranslationFailed} if the translation's content is missing/empty
	 *
	 * @returns Resolves to the translated content
	 */
	private async callLanguageModel(file: TranslationFile, content?: string): Promise<string> {
		const contentToTranslate = content ?? file.content;

		return this.queue.add(async () => {
			const callStartTime = Date.now();
			const estimatedInputTokens = this.estimateTokenCount(contentToTranslate);

			return pRetry(
				async () => {
					const attemptStartTime = Date.now();

					try {
						file.logger.debug(
							{ contentLength: contentToTranslate.length, estimatedInputTokens, model: this.model },
							"Calling LLM API",
						);

						const completion = await this.openai.chat.completions.create(
							await this.getLLMCompletionParams(contentToTranslate),
						);

						const translatedContent = completion.choices[0]?.message.content;

						if (!translatedContent) {
							throw new ApplicationError(
								"No content returned from language model",
								ErrorCode.NoContent,
								`${TranslatorService.name}.${this.callLanguageModel.name}`,
								{ model: this.model, contentLength: contentToTranslate.length },
							);
						}

						file.logger.debug(
							{
								model: this.model,
								durationMs: Date.now() - attemptStartTime,
								inputTokens: completion.usage?.prompt_tokens,
								outputTokens: completion.usage?.completion_tokens,
								totalTokens: completion.usage?.total_tokens,
								translatedLength: translatedContent.length,
							},
							"LLM API call successful",
						);

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
						file.logger.warn(
							{
								attempt,
								retriesLeft,
								error: error.message,
								totalElapsedMs: Date.now() - callStartTime,
								contentLength: contentToTranslate.length,
							},
							`LLM call attempt ${attempt} failed, ${retriesLeft} retries remaining`,
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
	 * @param file File instance for logger context
	 *
	 * @returns Cleaned translated content with artifacts removed
	 *
	 * @example
	 * ```typescript
	 * const translated = 'Here is the translation:\n\nActual content...';
	 * const cleaned = cleanupTranslatedContent(translated, file);
	 * console.log(cleaned); // 'Actual content...'
	 * ```
	 */
	private cleanupTranslatedContent(translatedContent: string, file: TranslationFile): string {
		file.logger.debug(
			{ translatedContentLength: translatedContent.length },
			"Cleaning up translated content",
		);

		let cleaned = translatedContent;

		for (const prefix of TRANSLATION_PREFIXES) {
			if (cleaned.trim().toLowerCase().startsWith(prefix.toLowerCase())) {
				cleaned = cleaned.substring(prefix.length).trim();
			}
		}

		cleaned = cleaned.trim();

		file.logger.debug(
			{ originalContentLength: file.content.length, cleanedContentLength: cleaned.length },
			"Adjusting line endings to match original content",
		);

		if (file.content.includes("\r\n")) {
			cleaned = cleaned.replace(LINE_ENDING_REGEX, "\r\n");
		}

		file.logger.debug(
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
	queue: queue,
	localeService,
	languageDetectorService,
	retryConfig: {
		retries: env.MAX_RETRY_ATTEMPTS,
	},
});
