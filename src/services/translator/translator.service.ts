import crypto from "node:crypto";

import { StatusCodes } from "http-status-codes";
import OpenAI from "openai";
import { APIError } from "openai/error";
import pRetry, { AbortError } from "p-retry";
import { isMap, parseDocument } from "yaml";

import type PQueue from "p-queue";
import type { Options as RetryOptions } from "p-retry";
import type { Logger } from "pino";

import { openai, queue } from "@/clients/";
import { ApplicationError, ErrorCode } from "@/errors/";
import { LanguageDetectorService, languageDetectorService } from "@/services/language-detector/";
import { localeService, LocaleService } from "@/services/locale/";
import {
	env,
	logger,
	maskLargeVerbatimFencedCodeBlocks,
	restoreMaskedVerbatimFences,
} from "@/utils/";

import { ChunksManager, TranslationValidatorManager } from "./managers";
import { REGEXES } from "./managers/managers.constants";
import {
	buildFrontmatterBlock,
	extractFrontmatterParts,
	mergePreservedYamlFrontmatter,
	splitLeadingYamlFrontmatter,
} from "./translator-frontmatter.util";
import { CONNECTIVITY_TEST_MAX_TOKENS, LLM_TEMPERATURE } from "./translator.constants";

/**
 * Identifies which segment of a chunked body is being translated in one LLM call.
 *
 * Omitted for whole-file translation and for small frontmatter scalar calls.
 */
type ChunkTranslationProgress = Readonly<{
	index: number;
	total: number;
}>;

/**
 * Selects which system prompt {@link TranslatorService.getSystemPrompt} builds for an LLM call.
 *
 * `markdownDocument` keeps chunking, verbatim-placeholder, and full doc rules. `frontmatterScalar`
 * uses a short metadata-only prompt so glossary text in the system message is not echoed into YAML.
 */
export type TranslationSystemPromptKind = "markdownDocument" | "frontmatterScalar";

/** Dependency injection interface for {@link TranslatorService} */
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
		this.title = this.extractDocTitleFromContent(content);
		this.correlationId = crypto.randomUUID();
		this.logger = (parentLogger ?? logger).child({
			file: this.filename,
			path: this.path,
			correlationId: this.correlationId,
		});
	}

	/**
	 * Extracts the title of a document from its content by matching the `title` frontmatter key.
	 *
	 * Supports both single and double quotes around the title value.
	 *
	 * @param content The content of the document
	 *
	 * @returns The title of the document, or `undefined` if not found
	 */
	private extractDocTitleFromContent(content: string): string | undefined {
		const frontmatterContentOnly = REGEXES.frontmatter.exec(content)?.groups?.["content"];

		if (!frontmatterContentOnly) return;

		const title = REGEXES.titleFrontmatterKey.exec(frontmatterContentOnly)?.groups?.["title"];

		return title?.replace(new RegExp(/['"]/g), "");
	}

	/**
	 * Returns a log-safe snapshot of this file (no `content` body).
	 *
	 * Pino `serializers.content` only applies to a top-level `content` key; logging `{ file: this }`
	 * still serializes `file.content` in full, so use this for structured logs.
	 */
	public getLogContext(): {
		filename: string;
		path: string;
		sha: string;
		correlationId: string;
		contentLength: number;
		title: string | undefined;
	} {
		return {
			filename: this.filename,
			path: this.path,
			sha: this.sha,
			correlationId: this.correlationId,
			contentLength: this.content.length,
			title: this.title,
		};
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

	/** Translation guidelines for consistent term translations */
	public translationGuidelines: string | null = null;

	public readonly managers: {
		translationValidator: TranslationValidatorManager;
		chunks: ChunksManager;
	};

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
		this.managers = {
			translationValidator: new TranslationValidatorManager(this.services.languageDetector),
			chunks: new ChunksManager(this.model),
		};
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

	/**
	 * Checks if an LLM API response is valid.
	 * Checks if the response has an ID, usage, and a message.
	 *
	 * @param response LLM API response to check
	 *
	 * @returns `true` if the response is valid, `false` otherwise
	 */
	private isLLMResponseValid(response: OpenAI.Chat.Completions.ChatCompletion): boolean {
		return Boolean(
			response.id &&
			typeof response.usage?.total_tokens === "number" &&
			response.choices.at(0)?.message,
		);
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
	 * 2. Optionally replaces very large fenced code blocks with placeholders when `MASK_VERBATIM_LARGE_FENCES` is enabled
	 * 3. Determines if chunking is needed based on token estimates (after any masking)
	 * 4. Translates content (with chunking if necessary)
	 * 5. Restores verbatim fences when masking was applied
	 * 6. Validates translation completeness
	 * 7. Cleans up and returns translated content
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
		file.logger.info({ file: file.getLogContext() }, "Translating content for file");

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

		const verbatimMask =
			env.MASK_VERBATIM_LARGE_FENCES ?
				maskLargeVerbatimFencedCodeBlocks(file.content, {
					estimateTokens: (markdown) => this.managers.chunks.estimateTokenCount(markdown),
					minTokens: env.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS,
				})
			:	null;

		const translationInput =
			verbatimMask && verbatimMask.replacements.length > 0 ?
				verbatimMask.maskedMarkdown
			:	file.content;

		const leadingFrontmatterSplit = splitLeadingYamlFrontmatter(translationInput);
		const hasBodyAfterLeadingYaml = leadingFrontmatterSplit.rest.length > 0;
		const preservedYamlBlock = hasBodyAfterLeadingYaml ? leadingFrontmatterSplit.block : "";
		const translationPayload =
			hasBodyAfterLeadingYaml ? leadingFrontmatterSplit.rest : translationInput;

		if (preservedYamlBlock) {
			file.logger.debug(
				{
					preservedYamlLength: preservedYamlBlock.length,
					bodyLength: translationPayload.length,
				},
				"Leading YAML frontmatter held back from LLM; will merge back after translation",
			);
		}

		const translationWorkFile = new TranslationFile(
			translationPayload,
			file.filename,
			file.path,
			file.sha,
			file.logger,
		);

		const contentNeedsChunking = this.managers.chunks.needsChunking(translationWorkFile);
		if (!contentNeedsChunking) {
			translatedContent = await this.callLanguageModel(translationWorkFile);
		} else {
			translatedContent = await this.translateWithChunking(translationWorkFile);
		}

		if (verbatimMask && verbatimMask.replacements.length > 0) {
			translatedContent = restoreMaskedVerbatimFences(translatedContent, verbatimMask.replacements);
		}

		if (preservedYamlBlock) {
			const frontmatterParts = extractFrontmatterParts(preservedYamlBlock);
			const mergedBlock =
				frontmatterParts ?
					buildFrontmatterBlock(
						frontmatterParts.bom,
						await this.translateFrontmatterStringFields(frontmatterParts.inner, file),
					)
				:	preservedYamlBlock;

			translatedContent = mergePreservedYamlFrontmatter(mergedBlock, translatedContent);
		}

		const translationDuration = Date.now() - translationStartTime;

		this.managers.translationValidator.validateTranslation(file, translatedContent);

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

		return this.managers.translationValidator.cleanupTranslatedContent(translatedContent, file);
	}

	/**
	 * Translates the string fields of a YAML frontmatter document.
	 *
	 * @param innerYaml The inner YAML of the frontmatter document
	 * @param file The file instance for logger context
	 *
	 * @returns The translated YAML frontmatter document
	 */
	private async translateFrontmatterStringFields(innerYaml: string, file: TranslationFile) {
		const FRONTMATTER_FIELDS_TO_TRANSLATE = ["title", "description"] as const;
		let doc;

		try {
			doc = parseDocument(innerYaml);
		} catch (error) {
			file.logger.warn({ error }, "YAML frontmatter parse failed; keeping original metadata");
			return innerYaml;
		}

		if (doc.errors.length > 0) {
			file.logger.warn(
				{ messages: doc.errors.map((error) => error.message) },
				"YAML frontmatter document has errors; keeping original metadata",
			);
			return innerYaml;
		}

		const root = doc.contents;
		if (!isMap(root)) return innerYaml;

		for (const key of FRONTMATTER_FIELDS_TO_TRANSLATE) {
			const value = doc.get(key);
			if (typeof value !== "string") continue;

			const trimmed = value.trim();
			if (!trimmed.length) continue;

			file.logger.debug(
				{ key, scalarLength: trimmed.length },
				"Translating YAML frontmatter field",
			);

			const snippetFile = new TranslationFile(
				trimmed,
				`${file.filename}#${key}`,
				file.path,
				file.sha,
				file.logger,
			);
			let translatedScalar = await this.callLanguageModel(
				snippetFile,
				trimmed,
				undefined,
				"frontmatterScalar",
			);

			translatedScalar = this.managers.translationValidator.cleanupTranslatedContent(
				translatedScalar,
				snippetFile,
			);

			if (!translatedScalar.length) {
				file.logger.warn(
					{ key },
					"Frontmatter field translation was empty; keeping original value",
				);
				continue;
			}

			doc.set(key, translatedScalar);
		}

		return String(doc);
	}

	/**
	 * Translates content using intelligent chunking for large files.
	 *
	 * Handles large files by breaking them into manageable pieces and processing
	 * each chunk separately. Automatically reassembles the translated chunks while
	 * maintaining proper spacing and structure. Validates that all chunks are
	 * successfully translated before reassembly.
	 *
	 * @param content Content to translate (automatically chunked if exceeds token limit)
	 *
	 * @returns Promise resolving to translated content reassembled from all chunks
	 *
	 * @see {@link ChunksManager.chunkContent} for chunking strategy details
	 * @see {@link TranslatorService.callLanguageModel} for individual chunk translation
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

		const { chunks, separators } = await this.managers.chunks.chunkContent(file.content);

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

		return this.managers.translationValidator.validateAndReassembleChunks(file, {
			original: chunks,
			translated: translatedChunks,
			separators,
		});
	}

	/**
	 * Translates a single chunk of content using the language model.
	 *
	 * @param file File instance for logger context
	 * @param chunk Content to translate
	 * @param index Index of the chunk
	 * @param chunks Array of all chunks
	 *
	 * @returns Promise resolving to the translated chunk
	 */
	private async translateChunk(
		file: TranslationFile,
		chunk: string,
		index: number,
		chunks: string[],
	): Promise<string> {
		const startTime = Date.now();
		const estimatedTokens = this.managers.chunks.estimateTokenCount(chunk);

		file.logger.debug(
			{
				chunkIndex: index + 1,
				totalChunks: chunks.length,
				chunkSize: chunk.length,
				estimatedTokens,
			},
			`Translating chunk ${index + 1}/${chunks.length}`,
		);

		const chunkProgress: ChunkTranslationProgress | undefined =
			chunks.length > 1 ? { index: index + 1, total: chunks.length } : undefined;
		const translatedChunk = await this.callLanguageModel(file, chunk, chunkProgress);

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
	 * @param chunkProgress Optional slice position when translating a chunked body in multiple calls
	 * @param systemPromptKind Which system prompt to build (defaults to full markdown document rules)
	 *
	 * @returns Chat completion parameters object
	 */
	private async getLLMCompletionParams(
		content: string,
		chunkProgress?: ChunkTranslationProgress,
		systemPromptKind: TranslationSystemPromptKind = "markdownDocument",
	): Promise<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> {
		return {
			model: this.model,
			temperature: LLM_TEMPERATURE,
			max_tokens: env.MAX_TOKENS,
			messages: [
				{
					role: "system",
					content: await this.getSystemPrompt(content, chunkProgress, systemPromptKind),
				},
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
	 * @param chunkProgress When set, the system prompt notes this body is slice `index` of `total` from one file
	 * @param systemPromptKind Which system prompt to use; YAML scalar fields use `frontmatterScalar`
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.TranslationFailed} if the translation's content is missing/empty
	 *
	 * @returns Resolves to the translated content
	 */
	private async callLanguageModel(
		file: TranslationFile,
		content?: string,
		chunkProgress?: ChunkTranslationProgress,
		systemPromptKind: TranslationSystemPromptKind = "markdownDocument",
	): Promise<string> {
		const contentToTranslate = content ?? file.content;

		return this.queue.add(async () => {
			const callStartTime = Date.now();
			const estimatedInputTokens = this.managers.chunks.estimateTokenCount(contentToTranslate);

			return pRetry(
				async () => {
					const attemptStartTime = Date.now();

					try {
						file.logger.debug(
							{
								contentLength: contentToTranslate.length,
								estimatedInputTokens,
								model: this.model,
								systemPromptKind,
							},
							"Calling LLM API",
						);

						const completion = await this.openai.chat.completions.create(
							await this.getLLMCompletionParams(
								contentToTranslate,
								chunkProgress,
								systemPromptKind,
							),
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
	 * Creates the system prompt that defines translation rules and requirements.
	 * Uses async language detection to determine source language and constructs
	 * a structured prompt following prompt engineering best practices.
	 *
	 * @param content Content to determine source language
	 * @param chunkProgress When set, documents that `content` is one slice of a larger markdown body
	 * @param systemPromptKind Document translation vs single frontmatter string (see {@link TranslationSystemPromptKind})
	 *
	 * @returns Resolves to the system prompt string
	 */
	private async getSystemPrompt(
		content: string,
		chunkProgress?: ChunkTranslationProgress,
		systemPromptKind: TranslationSystemPromptKind = "markdownDocument",
	): Promise<string> {
		this.logger.debug({ systemPromptKind }, "Generating system prompt for translation");

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

		if (systemPromptKind === "frontmatterScalar") {
			return this.buildFrontmatterScalarSystemPrompt(languages);
		}

		const translationGuidelinesSection =
			this.translationGuidelines ?
				`\n## TRANSLATION GUIDELINES\nApply these exact translations for the specified terms:\n${this.translationGuidelines}\n`
			:	"";

		const chunkSliceSection =
			chunkProgress && chunkProgress.total > 1 ?
				`
				# DOCUMENT SLICE
				The user message is slice ${chunkProgress.index} of ${chunkProgress.total} from one continuous markdown file.
				Keep terminology and structure aligned with a single document; translate only the markdown in the user message.
				`
			:	"";

		const builtSystemPrompt = `# ROLE
				You are an expert technical translator specializing in React documentation.
	
				# TASK
				Translate the provided content from ${languages.source} to ${languages.target} with absolute precision and technical accuracy.
				${chunkSliceSection}
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
				- Technical terms not specified in the translation guidelines
				- URLs, file paths, or configuration values
				- YAML frontmatter key names; title and description values are translated in a dedicated pass after the body
	
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
	
				${translationGuidelinesSection}
			`;

		const verbatimPlaceholderSection =
			content.includes("<!-- translate-react:verbatim-fence-") ?
				`
				# VERBATIM SOURCE PLACEHOLDERS
				Some fenced code regions were replaced with HTML comments matching \`<!-- translate-react:verbatim-fence-N -->\`.
				Copy each placeholder comment EXACTLY into your output at the same position; never translate, remove, reorder, or alter these comments.
				`
			:	"";

		return builtSystemPrompt + verbatimPlaceholderSection;
	}

	/**
	 * Builds the system prompt for translating a single YAML frontmatter string (title or description).
	 *
	 * Keeps glossary and locale rules as silent reference so models do not treat them as user content to translate into the reply.
	 *
	 * @param languages Human-readable source and target language names for the TASK section
	 *
	 * @returns The system prompt string for one scalar metadata translation call
	 */
	private buildFrontmatterScalarSystemPrompt(languages: { source: string; target: string }) {
		const termReferenceSection =
			this.translationGuidelines ?
				`
				# TERM REFERENCE (DO NOT OUTPUT)
				Use only for consistent terminology when translating the user string. Never copy, quote, translate, summarize, or repeat this reference in your reply.
	
				${this.translationGuidelines}
				`
			:	"";

		return `# ROLE
				You are an expert technical translator for React documentation metadata.
	
				# TASK
				The user message is one plain-text value from YAML frontmatter (a page title or description). Translate it from ${languages.source} to ${languages.target}.
	
				# RULES
				- Translate only natural language in that string
				- Keep proper nouns, product names, version numbers, code-like tokens, and URLs unchanged when the source keeps them unless the term reference explicitly maps them
				- Do not add markdown headings, list markers, code fences, or commentary
	
				# OUTPUT (STRICT)
				- Return only the translated string
				- No markdown document framing (no line whose first non-space character is #)
				- No preamble or labels (for example do not start with "Translation:" or "Here is")
				- Preserve intentional internal line breaks only when the user string already uses multiple lines you must keep
	
				${this.services.locale.definitions.rules.specific}
	
				${termReferenceSection}
				`;
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
