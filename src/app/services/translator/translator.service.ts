import OpenAI from "openai";
import { isMap, parseDocument } from "yaml";

import type PQueue from "p-queue";
import type { Options as RetryOptions } from "p-retry";

import type { LanguageDetectorService } from "@/app/services/language-detector/";
import type { LocaleService } from "@/app/services/locale/";
import type {
	OpenRouterModelLimits,
	OpenRouterModelLimitsService,
} from "@/app/services/openrouter/";

import type {
	ChunkTranslationProgress,
	TranslationSystemPromptKind,
} from "./llm/translation-system-prompt.types";
import type { TranslationAttemptContext } from "./pipeline/translation-attempt.context";
import type { FrontmatterBatchFieldKey } from "./translator-frontmatter-batch.schema";
import type { TranslationRetryInfo } from "./validation/validation.types";

import {
	env,
	logger,
	maskLargeVerbatimFencedCodeBlocks,
	restoreMaskedVerbatimFences,
} from "@/app/utils/";
import { ApplicationError, ErrorCode, isCompletionLengthTruncationError } from "@/shared/errors/";

import { ChunksManager } from "./chunking";
import { CHUNKS, SYSTEM_PROMPT_TOKEN_RESERVE } from "./chunking/chunking.constants";
import { TranslationLlmClient } from "./llm/translation-llm.client";
import { TranslationPromptBuilder } from "./llm/translation-prompt.builder";
import { stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences } from "./markdown/artifacts";
import {
	buildFrontmatterBlock,
	extractFrontmatterParts,
	mergePreservedYamlFrontmatter,
	splitLeadingYamlFrontmatter,
} from "./markdown/frontmatter";
import {
	emptyTranslationAttemptContext,
	translationAttemptContextFromHints,
} from "./pipeline/translation-attempt.context";
import { TranslationPipelineManager } from "./pipeline/translation-pipeline.manager";
import { validateAndReassembleChunks } from "./postprocess/chunk-reassembly";
import {
	buildChunkTerminologyRetryHints,
	findChunkTerminologyConsistencyDrift,
} from "./postprocess/chunk-terminology-consistency";
import { cleanupTranslatedContent } from "./postprocess/translation-output-cleanup";
import { TranslationFile } from "./translation-file";
import { CONNECTIVITY_TEST_MAX_TOKENS, LLM_TEMPERATURE } from "./translator.constants";
import { PostTranslationValidationService } from "./validation/post-translation-validation.service";
import { TranslationLanguageCheck } from "./validation/translation-language-check";

export * from "./translation-file";

export type {
	ChunkTranslationProgress,
	TranslationSystemPromptKind,
} from "./llm/translation-system-prompt.types";

export type { TranslationRetryInfo } from "./validation/validation.types";

/** Optional inputs for {@link TranslatorService.translateContent} */
export interface TranslateContentOptions {
	/** Extra retry hints from maintainer review (section-scoped remediation) */
	readonly validationRetryHints?: readonly string[];
}

/** Result from translating a file, including retry metadata */
export interface TranslationResult {
	/** The translated content */
	content: string;

	/** Retries that occurred during post-translation validation (empty if none) */
	retries: readonly TranslationRetryInfo[];
}

/** Dependency injection interface for {@link TranslatorService} */
export interface TranslatorServiceDependencies {
	/** OpenAI client instance for LLM API calls */
	openai: OpenAI;

	/** LLM model identifier for chat completions */
	model: string;

	/** Rate limiting queue for LLM API calls */
	queue: PQueue;

	/** Locale strings and PR templates for the target language */
	localeService: LocaleService;

	/** CLD-backed language detector */
	languageDetectorService: LanguageDetectorService;

	/** Retry configuration for LLM API calls */
	retryConfig: RetryOptions;

	/** OpenRouter model catalog limits (hosted API only) */
	openRouterModelLimitsService: OpenRouterModelLimitsService;

	/** Optional LLM transport client (defaults to {@link TranslationLlmClient}) */
	llmClient?: TranslationLlmClient;
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

	/**
	 * When OpenRouter model metadata is loaded, caps chat `max_tokens` by the provider’s
	 * `max_completion_tokens` (and `MAX_TOKENS`). Otherwise `null` and {@link env.MAX_TOKENS} is used.
	 */
	private providerCompletionTokenCap: number | null = null;

	public readonly services: {
		/** Locale service for language-specific rules */
		locale: LocaleService;

		/** Language detector for content analysis */
		languageDetector: LanguageDetectorService;
	};

	/** Translation guidelines for consistent term translations */
	public translationGuidelines: string | null = null;

	public readonly managers: {
		chunks: ChunksManager;
		pipeline: TranslationPipelineManager;
		validation: PostTranslationValidationService;
		languageCheck: TranslationLanguageCheck;
	};

	private readonly promptBuilder: TranslationPromptBuilder;

	/** OpenAI chat completion transport with retries and rate limiting */
	private readonly llmClient: TranslationLlmClient;

	/** Resolves OpenRouter `GET /v1/models` limits for chunk and completion caps */
	private readonly openRouterModelLimitsService: OpenRouterModelLimitsService;

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
		this.openRouterModelLimitsService = dependencies.openRouterModelLimitsService;
		this.managers = {
			chunks: new ChunksManager(this.model),
			pipeline: new TranslationPipelineManager(),
			validation: new PostTranslationValidationService({
				getTranslationGuidelines: () => this.translationGuidelines,
			}),
			languageCheck: new TranslationLanguageCheck(this.services.languageDetector),
		};
		this.promptBuilder = new TranslationPromptBuilder(
			this.services.languageDetector,
			this.services.locale,
		);
		this.llmClient =
			dependencies.llmClient ??
			new TranslationLlmClient({
				openai: this.openai,
				model: this.model,
				queue: this.queue,
				retryConfig: this.retryConfig,
				promptBuilder: this.promptBuilder,
				estimateInputTokens: (content) => this.managers.chunks.estimateTokenCount(content),
				getCompletionTokenCap: () => this.providerCompletionTokenCap ?? env.MAX_TOKENS,
				resolveDocumentSourceLanguage: (fullMarkdown) =>
					this.resolveDocumentSourceLanguage(fullMarkdown),
				getTranslationGuidelines: () => this.translationGuidelines,
			});
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

		if (!this.llmClient.isLLMResponseValid(response)) {
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

		await this.maybeApplyOpenRouterModelLimits();
	}

	/**
	 * When enabled and the base URL is hosted OpenRouter, loads `GET /v1/models` limits for {@link env.LLM_MODEL}
	 * to widen per-chunk input budgets and align `max_tokens` with `top_provider.max_completion_tokens`.
	 */
	private async maybeApplyOpenRouterModelLimits() {
		if (!env.LLM_API_BASE_URL.includes("openrouter")) {
			return;
		}

		if (!this.openRouterModelLimitsService.isHostedOpenRouterBaseUrl(env.LLM_API_BASE_URL)) {
			this.logger.debug(
				{ baseUrl: env.LLM_API_BASE_URL },
				"Skipping OpenRouter model metadata: base URL is not hosted OpenRouter",
			);

			return;
		}

		if (!env.LLM_API_KEY) {
			this.logger.debug("Skipping OpenRouter model metadata: LLM_API_KEY is not set");

			return;
		}

		const limits: OpenRouterModelLimits | null =
			await this.openRouterModelLimitsService.fetchLimitsForModel(
				env.LLM_API_BASE_URL,
				env.LLM_API_KEY,
				this.model,
			);

		if (!limits) {
			return;
		}

		const completionCap = Math.min(env.MAX_TOKENS, limits.maxCompletionTokens ?? env.MAX_TOKENS);
		this.providerCompletionTokenCap = completionCap;

		const grossChunkInputTokens = Math.floor(
			limits.contextLength - SYSTEM_PROMPT_TOKEN_RESERVE - completionCap,
		);

		if (grossChunkInputTokens < 256) {
			this.logger.warn(
				{
					model: this.model,
					contextLength: limits.contextLength,
					completionCap,
					grossChunkInputTokens,
				},
				"OpenRouter context window too small for safe chunking; keeping default chunk size",
			);

			return;
		}

		this.managers.chunks = new ChunksManager(this.model, grossChunkInputTokens, completionCap);

		this.logger.info(
			{
				model: this.model,
				contextLength: limits.contextLength,
				maxCompletionTokens: limits.maxCompletionTokens,
				grossChunkInputTokens,
				completionCap,
			},
			"Applied OpenRouter model limits for chunking",
		);
	}

	/**
	 * Resolves the document source language once on full markdown before chunking or body-only extraction.
	 *
	 * Uses the same string passed into the frontmatter split (after verbatim masking when enabled), so CLD sees the whole file the workflow will translate.
	 *
	 * @param fullMarkdown Full markdown for this translation pass
	 *
	 * @returns Detected React source code, or `en` when the input is too short for CLD or detection is inconclusive
	 */
	private async resolveDocumentSourceLanguage(fullMarkdown: string) {
		return (await this.services.languageDetector.detectPrimaryLanguage(fullMarkdown)) ?? "en";
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
	 * 3. Resolves source language once on full-file markdown (after any verbatim masking) before chunking
	 * 4. Determines if chunking is needed based on token estimates (after any masking)
	 * 5. Translates content (with chunking if necessary)
	 * 6. Restores verbatim fences when masking was applied
	 * 7. Validates translation completeness
	 * 8. Cleans up and returns translated content
	 *
	 * @param file File containing content to translate
	 * @param options Optional maintainer retry hints for the first attempt
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
	public async translateContent(
		file: TranslationFile,
		options?: TranslateContentOptions,
	): Promise<TranslationResult> {
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

		file.documentSourceLanguage = await this.resolveDocumentSourceLanguage(translationInput);

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
			file.documentSourceLanguage,
		);

		const fileBodySplit = splitLeadingYamlFrontmatter(file.content);
		const sourceBodyForArtifacts =
			fileBodySplit.rest.length > 0 ? fileBodySplit.rest : file.content;

		const initialAttemptContext =
			options?.validationRetryHints?.length ?
				translationAttemptContextFromHints(options.validationRetryHints)
			:	emptyTranslationAttemptContext();

		const pipelineResult = await this.managers.pipeline.translateWithValidationRetries({
			file,
			translateBody: (attemptContext) =>
				this.translateMarkdownBody(translationWorkFile, attemptContext),
			initialAttemptContext,
			finalizeTranslation: async (bodyTranslation) => {
				let finalized = bodyTranslation;

				if (verbatimMask && verbatimMask.replacements.length > 0) {
					finalized = restoreMaskedVerbatimFences(finalized, verbatimMask.replacements);
				}

				finalized = stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(
					sourceBodyForArtifacts,
					finalized,
					file.logger,
				);

				if (preservedYamlBlock) {
					const frontmatterParts = extractFrontmatterParts(preservedYamlBlock);
					const mergedBlock =
						frontmatterParts ?
							buildFrontmatterBlock(
								frontmatterParts.bom,
								await this.translateFrontmatterStringFields(frontmatterParts.inner, file),
							)
						:	preservedYamlBlock;

					return mergePreservedYamlFrontmatter(mergedBlock, finalized, translationPayload);
				}

				return finalized;
			},
			collectIssues: (content) =>
				this.managers.validation.collectRetryableValidationIssues(file, content),
			createFailedError: (content, issues) =>
				this.managers.validation.createValidationFailedError(file, content, issues),
		});

		const translationDuration = Date.now() - translationStartTime;

		this.managers.validation.recordSoftValidationWarnings(file, pipelineResult.content);

		file.logger.info(
			{
				filename: file.filename,
				originalLength: file.content.length,
				translatedLength: pipelineResult.content.length,
				durationMs: translationDuration,
				sizeRatio: (pipelineResult.content.length / file.content.length).toFixed(2),
				retryCount: pipelineResult.retries.length,
			},
			"Translation completed successfully",
		);

		return {
			content: cleanupTranslatedContent(pipelineResult.content, file),
			retries: pipelineResult.retries,
		};
	}

	/**
	 * Translates the `description` string field of a YAML frontmatter document when present; other keys are left unchanged.
	 *
	 * @param innerYaml The inner YAML of the frontmatter document
	 * @param file The file instance for logger context
	 *
	 * @returns The translated YAML frontmatter document
	 */
	private async translateFrontmatterStringFields(innerYaml: string, file: TranslationFile) {
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

		const batchItems: { fieldKey: FrontmatterBatchFieldKey; source: string }[] = [];

		const descriptionValue = doc.get("description");
		if (typeof descriptionValue === "string") {
			const trimmed = descriptionValue.trim();
			if (trimmed.length > 0) {
				batchItems.push({ fieldKey: "description", source: trimmed });
			}
		}

		if (batchItems.length === 0) {
			return doc.toString({ lineWidth: 0 });
		}

		file.logger.debug(
			{ fields: batchItems.map((item) => item.fieldKey) },
			"Translating YAML frontmatter string fields in one structured LLM call",
		);

		const envelope = await this.llmClient.callLanguageModelFrontmatterBatch(file, batchItems);
		const translatedByKey = new Map(
			envelope.items.map((item) => [item.fieldKey, item.translated] as const),
		);

		for (const { fieldKey } of batchItems) {
			let translatedScalar = translatedByKey.get(fieldKey);
			if (translatedScalar === undefined) {
				file.logger.warn(
					{ fieldKey },
					"Frontmatter batch response missing a field; keeping original value",
				);
				continue;
			}

			const snippetFile = new TranslationFile(
				translatedScalar,
				`${file.filename}#${fieldKey}`,
				file.path,
				file.sha,
				file.logger,
				file.documentSourceLanguage,
			);

			translatedScalar = cleanupTranslatedContent(translatedScalar, snippetFile);

			if (!translatedScalar.length) {
				file.logger.warn(
					{ fieldKey },
					"Frontmatter field translation was empty after cleanup; keeping original value",
				);
				continue;
			}

			doc.set(fieldKey, translatedScalar);
		}

		return doc.toString({ lineWidth: 0 });
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
	/**
	 * Translates markdown body content (single-shot or chunked) with optional validation retry hints.
	 *
	 * @param file Work file whose `content` is the body sent to the LLM (frontmatter already split off)
	 * @param attemptContext Guard hints from a failed post-translation validation attempt
	 *
	 * @returns Translated markdown body before frontmatter merge
	 */
	private async translateMarkdownBody(
		file: TranslationFile,
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
	) {
		const contentNeedsChunking = this.managers.chunks.needsChunking(file);
		if (contentNeedsChunking) {
			return this.translateWithChunking(file, attemptContext);
		}

		try {
			return await this.callLanguageModel(
				file,
				undefined,
				undefined,
				"markdownDocument",
				undefined,
				attemptContext,
			);
		} catch (error) {
			if (!isCompletionLengthTruncationError(error)) {
				throw error;
			}

			file.logger.info(
				{ path: file.path, contentLength: file.content.length },
				"Completion token limit reached; translating in chunks",
			);
			return this.translateWithChunking(file, attemptContext);
		}
	}

	private async translateWithChunking(
		file: TranslationFile,
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
	): Promise<string> {
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

		let translatedChunks = await Promise.all(
			chunks.map((chunk, index) => this.translateChunk(file, chunk, index, chunks, attemptContext)),
		);

		translatedChunks = await this.retryChunksWithTerminologyDrift(
			file,
			chunks,
			translatedChunks,
			attemptContext,
		);

		file.logger.debug(
			{ translatedChunkCount: translatedChunks.length },
			"All chunks translated, reassembling",
		);

		return validateAndReassembleChunks(file, {
			original: chunks,
			translated: translatedChunks,
			separators,
		});
	}

	/**
	 * Re-translates only slices that disagree on pt-br terminology after the initial chunk pass.
	 *
	 * @param file File under translation
	 * @param sourceChunks Original markdown slices
	 * @param translatedChunks Current translated slices
	 * @param attemptContext Pipeline guard hints to preserve across slice retries
	 *
	 * @returns Updated translated slices (unchanged when drift is absent or locale is not pt-br)
	 */
	private async retryChunksWithTerminologyDrift(
		file: TranslationFile,
		sourceChunks: readonly string[],
		translatedChunks: readonly string[],
		attemptContext: TranslationAttemptContext,
	) {
		if (env.TARGET_LANGUAGE !== "pt-br" || sourceChunks.length < 2) {
			return [...translatedChunks];
		}

		let currentChunks = [...translatedChunks];

		for (let pass = 1; pass < CHUNKS.terminologyConsistencyMaxPasses; pass++) {
			const drifts = findChunkTerminologyConsistencyDrift(sourceChunks, currentChunks);
			if (drifts.length === 0) break;

			const chunkIndices = [
				...new Set(drifts.flatMap((drift) => drift.offendingChunkIndices)),
			].sort((left, right) => left - right);

			const driftHints = buildChunkTerminologyRetryHints(drifts);
			const sliceAttemptContext = translationAttemptContextFromHints([
				...attemptContext.validationRetryHints,
				...driftHints,
			]);

			file.logger.warn(
				{
					pass,
					maxPasses: CHUNKS.terminologyConsistencyMaxPasses,
					chunkIndices,
					driftCount: drifts.length,
				},
				"Chunk terminology drift detected; re-translating affected slices",
			);

			const retried = await Promise.all(
				chunkIndices.map(async (index) => {
					const sourceChunk = sourceChunks[index];
					if (sourceChunk === undefined) return currentChunks[index] ?? "";

					return this.translateChunk(
						file,
						sourceChunk,
						index,
						[...sourceChunks],
						sliceAttemptContext,
					);
				}),
			);

			const nextChunks = [...currentChunks];
			for (const [offset, index] of chunkIndices.entries()) {
				const translated = retried[offset];
				if (translated !== undefined) {
					nextChunks[index] = translated;
				}
			}
			currentChunks = nextChunks;
		}

		return currentChunks;
	}

	/** Reduction factor for re-chunking when a chunk hits completion token limits */
	private static readonly RECHUNK_BUDGET_FACTOR = 0.5;

	/**
	 * Translates a single chunk of content using the language model.
	 *
	 * When the LLM truncates output due to completion token limits, the chunk is
	 * automatically split into smaller sub-chunks and translated recursively.
	 *
	 * @param file File instance for logger context
	 * @param chunk Content to translate
	 * @param index Index of the chunk
	 * @param chunks Array of all chunks
	 * @param attemptContext Guard hints from a failed post-translation validation attempt
	 * @param tokenBudget Maximum tokens per sub-chunk (used during recursive re-chunking)
	 *
	 * @returns Promise resolving to the translated chunk
	 */
	private async translateChunk(
		file: TranslationFile,
		chunk: string,
		index: number,
		chunks: string[],
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
		tokenBudget?: number,
	): Promise<string> {
		const startTime = Date.now();
		const estimatedTokens = this.managers.chunks.estimateTokenCount(chunk);

		file.logger.debug(
			{
				chunkIndex: index + 1,
				totalChunks: chunks.length,
				chunkSize: chunk.length,
				estimatedTokens,
				tokenBudget,
			},
			`Translating chunk ${index + 1}/${chunks.length}`,
		);

		const chunkProgress: ChunkTranslationProgress | undefined =
			chunks.length > 1 ? { index: index + 1, total: chunks.length } : undefined;

		try {
			const translatedChunk = await this.callLanguageModel(
				file,
				chunk,
				chunkProgress,
				"markdownDocument",
				undefined,
				attemptContext,
			);

			const strippedChunk = stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(
				chunk,
				translatedChunk,
				file.logger,
			);

			file.logger.debug(
				{
					chunkIndex: index + 1,
					totalChunks: chunks.length,
					originalSize: chunk.length,
					translatedSize: strippedChunk.length,
					durationMs: Date.now() - startTime,
				},
				`Chunk ${index + 1}/${chunks.length} translation complete`,
			);

			return strippedChunk;
		} catch (error) {
			if (!isCompletionLengthTruncationError(error)) {
				throw error;
			}

			return this.handleChunkTruncation(file, chunk, index, chunks, attemptContext, tokenBudget);
		}
	}

	/**
	 * Handles chunk truncation by re-chunking with a reduced token budget and translating recursively.
	 *
	 * @param file File instance for logger context
	 * @param chunk The chunk that was truncated
	 * @param index Index of the chunk in the parent array
	 * @param chunks Parent chunk array
	 * @param attemptContext Guard hints from a failed post-translation validation attempt
	 * @param currentBudget Current token budget (if already in a re-chunk pass)
	 *
	 * @returns Translated content assembled from sub-chunks
	 */
	private async handleChunkTruncation(
		file: TranslationFile,
		chunk: string,
		index: number,
		chunks: string[],
		attemptContext: TranslationAttemptContext,
		currentBudget?: number,
	) {
		const baseBudget = currentBudget ?? this.managers.chunks.getMarkdownChunkSplitterTokenBudget();
		const reducedBudget = Math.max(
			256,
			Math.floor(baseBudget * TranslatorService.RECHUNK_BUDGET_FACTOR),
		);

		file.logger.info(
			{
				chunkIndex: index + 1,
				totalChunks: chunks.length,
				chunkLength: chunk.length,
				baseBudget,
				reducedBudget,
			},
			"Chunk hit completion token limit; re-chunking with reduced budget",
		);

		const { chunks: subChunks, separators } = await this.managers.chunks.chunkContent(
			chunk,
			reducedBudget,
		);

		if (subChunks.length <= 1) {
			file.logger.warn(
				{ chunkIndex: index + 1, reducedBudget },
				"Re-chunking produced single chunk; content may still truncate",
			);
		}

		file.logger.debug(
			{ subChunkCount: subChunks.length, reducedBudget },
			"Re-chunking complete; translating sub-chunks",
		);

		const translatedSubChunks = await Promise.all(
			subChunks.map((subChunk, subIndex) =>
				this.translateChunk(file, subChunk, subIndex, subChunks, attemptContext, reducedBudget),
			),
		);

		return validateAndReassembleChunks(file, {
			original: subChunks,
			translated: translatedSubChunks,
			separators,
		});
	}

	/**
	 * Delegates a single LLM translation call to {@link TranslationLlmClient.callLanguageModel}.
	 *
	 * @param file File under translation (logging and prompt context)
	 * @param content Optional markdown slice; defaults to `file.content`
	 * @param chunkProgress Slice index when translating a chunked document
	 * @param systemPromptKind Markdown body vs frontmatter batch prompt
	 * @param responseFormat Optional structured output format for the completion
	 * @param attemptContext Guard retry hints from prior validation failures
	 *
	 * @returns LLM completion text from the shared client
	 *
	 * @see {@link TranslationLlmClient.callLanguageModel}
	 */
	private callLanguageModel(
		file: TranslationFile,
		content?: string,
		chunkProgress?: ChunkTranslationProgress,
		systemPromptKind: TranslationSystemPromptKind = "markdownDocument",
		responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["response_format"],
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
	) {
		return this.llmClient.callLanguageModel(
			file,
			content,
			chunkProgress,
			systemPromptKind,
			responseFormat,
			attemptContext,
		);
	}
}
