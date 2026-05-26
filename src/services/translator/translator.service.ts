import { StatusCodes } from "http-status-codes";
import OpenAI from "openai";
import { APIError } from "openai/error";
import { zodResponseFormat } from "openai/helpers/zod";
import pRetry, { AbortError } from "p-retry";
import { isMap, parseDocument } from "yaml";

import type PQueue from "p-queue";
import type { Options as RetryOptions } from "p-retry";
import type { Logger } from "pino";

import type { OpenRouterModelLimits } from "@/services/openrouter/";
import type { ReactLanguageCode } from "@/utils/";

import type { FrontmatterBatchFieldKey } from "./translator-frontmatter-batch.schema";

import { openai, queue } from "@/clients/";
import { ApplicationError, ErrorCode, isCompletionLengthTruncationError } from "@/errors/";
import { LanguageDetectorService, languageDetectorService } from "@/services/language-detector/";
import { localeService, LocaleService } from "@/services/locale/";
import { openRouterModelLimitsService } from "@/services/openrouter/";
import {
	env,
	getRateLimitResetWaitMs,
	isOpenRouterDailyFreeModelQuotaError,
	logger,
	maskLargeVerbatimFencedCodeBlocks,
	restoreMaskedVerbatimFences,
} from "@/utils/";

import { ChunksManager, TranslationValidatorManager } from "./managers";
import { SYSTEM_PROMPT_TOKEN_RESERVE } from "./managers/managers.constants";
import { TRANSLATION_VALIDATION_MAX_ATTEMPTS } from "./validation/validation.constants";
import {
	frontmatterBatchRequestEnvelopeSchema,
	frontmatterBatchTranslationEnvelopeSchema,
} from "./translator-frontmatter-batch.schema";
import {
	buildFrontmatterBlock,
	extractFrontmatterParts,
	extractTitleScalarFromInnerYaml,
	mergePreservedYamlFrontmatter,
	splitLeadingYamlFrontmatter,
} from "./translator-frontmatter.util";
import { stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences } from "./translator-markdown-artifacts.util";
import { CONNECTIVITY_TEST_MAX_TOKENS, LLM_TEMPERATURE } from "./translator.constants";
import { TranslationFile } from "./translation-file";

export { TranslationFile } from "./translation-file";

/** Structured-output schema for batched YAML `description` translation (OpenRouter/OpenAI JSON mode). */
const FRONTMATTER_BATCH_RESPONSE_FORMAT = zodResponseFormat(
	frontmatterBatchTranslationEnvelopeSchema,
	"frontmatter_batch_translations",
);

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
 * `markdownDocument` keeps chunking, verbatim-placeholder, and full doc rules. `frontmatterBatch`
 * uses one structured-output call for the YAML `description` string field when present.
 */
export type TranslationSystemPromptKind = "markdownDocument" | "frontmatterBatch";

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

		if (!openRouterModelLimitsService.isHostedOpenRouterBaseUrl(env.LLM_API_BASE_URL)) {
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
			await openRouterModelLimitsService.fetchLimitsForModel(
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
		let translatedContent = "";

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

		let validationRetryHints: string[] = [];

		for (let attempt = 1; attempt <= TRANSLATION_VALIDATION_MAX_ATTEMPTS; attempt++) {
			let bodyTranslation = await this.translateMarkdownBody(
				translationWorkFile,
				validationRetryHints,
			);

			if (verbatimMask && verbatimMask.replacements.length > 0) {
				bodyTranslation = restoreMaskedVerbatimFences(
					bodyTranslation,
					verbatimMask.replacements,
				);
			}

			bodyTranslation = stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(
				sourceBodyForArtifacts,
				bodyTranslation,
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

				translatedContent = mergePreservedYamlFrontmatter(
					mergedBlock,
					bodyTranslation,
					translationPayload,
				);
			} else {
				translatedContent = bodyTranslation;
			}

			const validationIssues = this.managers.translationValidator.collectRetryableValidationIssues(
				file,
				translatedContent,
			);

			if (validationIssues.length === 0) {
				break;
			}

			if (attempt >= TRANSLATION_VALIDATION_MAX_ATTEMPTS) {
				throw this.managers.translationValidator.createValidationFailedError(
					file,
					translatedContent,
					validationIssues,
				);
			}

			validationRetryHints = validationIssues.map((issue) => issue.retryHint);

			file.logger.warn(
				{
					attempt,
					maxAttempts: TRANSLATION_VALIDATION_MAX_ATTEMPTS,
					guardIds: validationIssues.map((issue) => issue.guardId),
				},
				"Post-translation validation failed; retrying with guard hints",
			);
		}

		const translationDuration = Date.now() - translationStartTime;

		this.managers.translationValidator.recordSoftValidationWarnings(file, translatedContent);

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

		const envelope = await this.callLanguageModelFrontmatterBatch(file, batchItems);
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

			translatedScalar = this.managers.translationValidator.cleanupTranslatedContent(
				translatedScalar,
				snippetFile,
			);

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
	 * Translates all requested YAML frontmatter string fields in one LLM completion using JSON schema output.
	 *
	 * Uses the same glossary and locale rules as the markdown body pass, encoded in the system prompt, so
	 * terminology stays consistent between the `description` field and the document body.
	 *
	 * @param file Logical document being translated (for logging and resolved source language)
	 * @param batchItems Field keys and source strings to translate (the `description` field when present)
	 *
	 * @throws {ApplicationError} When the model returns empty content, truncates, or JSON that fails schema validation
	 *
	 * @returns Parsed envelope matching {@link frontmatterBatchTranslationEnvelopeSchema}
	 */
	private async callLanguageModelFrontmatterBatch(
		file: TranslationFile,
		batchItems: readonly { fieldKey: FrontmatterBatchFieldKey; source: string }[],
	) {
		file.documentSourceLanguage ??= await this.resolveDocumentSourceLanguage(file.content);

		const requestPayload = frontmatterBatchRequestEnvelopeSchema.parse({ items: batchItems });
		const userMessage = JSON.stringify(requestPayload);
		const contentLengthForLog = userMessage.length;

		return this.queue.add(async () => {
			const callStartTime = Date.now();
			const estimatedInputTokens = this.managers.chunks.estimateTokenCount(userMessage);

			return pRetry(
				async () => {
					const attemptStartTime = Date.now();

					try {
						file.logger.debug(
							{
								contentLength: contentLengthForLog,
								estimatedInputTokens,
								model: this.model,
								systemPromptKind: "frontmatterBatch",
							},
							"Calling LLM API for batched frontmatter metadata",
						);

						const completion = await this.openai.chat.completions.create(
							this.getLLMCompletionParams(
								file,
								userMessage,
								undefined,
								"frontmatterBatch",
								FRONTMATTER_BATCH_RESPONSE_FORMAT,
							),
						);

						const rawJson = completion.choices[0]?.message.content;

						if (!rawJson) {
							throw new ApplicationError(
								"No content returned from language model for frontmatter batch",
								ErrorCode.NoContent,
								`${TranslatorService.name}.${this.callLanguageModelFrontmatterBatch.name}`,
								{ model: this.model, contentLength: contentLengthForLog },
							);
						}

						const finishReason = completion.choices[0]?.finish_reason;
						if (finishReason === "length") {
							throw new ApplicationError(
								"Language model response ended at max completion tokens (truncated frontmatter batch JSON)",
								ErrorCode.TranslationFailed,
								`${TranslatorService.name}.${this.callLanguageModelFrontmatterBatch.name}`,
								{
									model: this.model,
									contentLength: contentLengthForLog,
									finishReason,
									completionTokens: completion.usage?.completion_tokens,
									promptTokens: completion.usage?.prompt_tokens,
								},
							);
						}

						const parsedEnvelope = frontmatterBatchTranslationEnvelopeSchema.safeParse(
							JSON.parse(rawJson),
						);

						if (!parsedEnvelope.success) {
							throw new ApplicationError(
								"Frontmatter batch response failed schema validation",
								ErrorCode.TranslationFailed,
								`${TranslatorService.name}.${this.callLanguageModelFrontmatterBatch.name}`,
								{
									model: this.model,
									issues: parsedEnvelope.error.issues,
								},
							);
						}

						const requestedKeys = new Set(batchItems.map((item) => item.fieldKey));
						const responseKeys = new Set(parsedEnvelope.data.items.map((item) => item.fieldKey));

						if (
							requestedKeys.size !== responseKeys.size ||
							[...requestedKeys].some((k) => !responseKeys.has(k))
						) {
							throw new ApplicationError(
								"Frontmatter batch response keys do not match requested fields",
								ErrorCode.TranslationFailed,
								`${TranslatorService.name}.${this.callLanguageModelFrontmatterBatch.name}`,
								{
									requested: [...requestedKeys],
									received: [...responseKeys],
								},
							);
						}

						file.logger.debug(
							{
								model: this.model,
								durationMs: Date.now() - attemptStartTime,
								inputTokens: completion.usage?.prompt_tokens,
								outputTokens: completion.usage?.completion_tokens,
								totalTokens: completion.usage?.total_tokens,
								fieldCount: parsedEnvelope.data.items.length,
							},
							"LLM frontmatter batch call successful",
						);

						return parsedEnvelope.data;
					} catch (error) {
						if (error instanceof SyntaxError) {
							throw new ApplicationError(
								"Frontmatter batch response was not valid JSON",
								ErrorCode.TranslationFailed,
								`${TranslatorService.name}.${this.callLanguageModelFrontmatterBatch.name}`,
								{ model: this.model, parseError: error.message },
							);
						}

						if (error instanceof APIError) {
							if (
								error.status === StatusCodes.UNAUTHORIZED ||
								error.status === StatusCodes.BAD_REQUEST
							) {
								throw new AbortError(error);
							}

							if (isOpenRouterDailyFreeModelQuotaError(error)) {
								file.logger.error(
									{
										model: this.model,
										message: error.message,
									},
									"OpenRouter free-models-per-day limit reached; add credits, drop :free, or wait for the daily reset",
								);
								throw new AbortError(error);
							}
						}

						throw error;
					}
				},
				{
					...this.retryConfig,
					onFailedAttempt: async ({ attemptNumber: attempt, error, retriesLeft }) => {
						file.logger.warn(
							{
								attempt,
								retriesLeft,
								error: error instanceof Error ? error.message : String(error),
								totalElapsedMs: Date.now() - callStartTime,
								contentLength: contentLengthForLog,
							},
							`LLM frontmatter batch attempt ${attempt} failed, ${retriesLeft} retries remaining`,
						);

						const resetWaitMs = getRateLimitResetWaitMs(error);
						if (resetWaitMs > 0) {
							file.logger.info({ resetWaitMs }, "Waiting for LLM rate limit window before retry");
							await new Promise<void>((resolve) => setTimeout(resolve, resetWaitMs));
						}
					},
				},
			);
		});
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
	 * @param validationRetryHints Guard hints from a failed post-translation validation attempt
	 *
	 * @returns Translated markdown body before frontmatter merge
	 */
	private async translateMarkdownBody(
		file: TranslationFile,
		validationRetryHints: string[] = [],
	) {
		const contentNeedsChunking = this.managers.chunks.needsChunking(file);
		if (contentNeedsChunking) {
			return this.translateWithChunking(file, validationRetryHints);
		}

		try {
			return await this.callLanguageModel(
				file,
				undefined,
				undefined,
				"markdownDocument",
				undefined,
				validationRetryHints,
			);
		} catch (error) {
			if (!isCompletionLengthTruncationError(error)) {
				throw error;
			}

			file.logger.info(
				{ path: file.path, contentLength: file.content.length },
				"Completion token limit reached; translating in chunks",
			);
			return this.translateWithChunking(file, validationRetryHints);
		}
	}

	private async translateWithChunking(
		file: TranslationFile,
		validationRetryHints: string[] = [],
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

		const translatedChunks = await Promise.all(
			chunks.map((chunk, index) =>
				this.translateChunk(file, chunk, index, chunks, validationRetryHints),
			),
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
		validationRetryHints: string[] = [],
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
		const translatedChunk = await this.callLanguageModel(
			file,
			chunk,
			chunkProgress,
			"markdownDocument",
			undefined,
			validationRetryHints,
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
	}

	/**
	 * Prepares parameters for LLM chat completion API call.
	 *
	 * @param file Translation file instance
	 * @param userMessageContent User message sent to the model
	 * @param chunkProgress Optional slice position when translating a chunked body in multiple calls
	 * @param systemPromptKind Which system prompt to build (defaults to full markdown document rules)
	 *
	 * @returns Chat completion parameters object
	 */
	private getLLMCompletionParams(
		file: TranslationFile,
		userMessageContent: string,
		chunkProgress?: ChunkTranslationProgress,
		systemPromptKind: TranslationSystemPromptKind = "markdownDocument",
		responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["response_format"],
		validationRetryHints: string[] = [],
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
		const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
			model: this.model,
			temperature: LLM_TEMPERATURE,
			max_tokens: this.providerCompletionTokenCap ?? env.MAX_TOKENS,
			messages: [
				{
					role: "system",
					content: this.getSystemPrompt(
						file,
						userMessageContent,
						chunkProgress,
						systemPromptKind,
						validationRetryHints,
					),
				},
				{ role: "user", content: userMessageContent },
			],
		};

		if (responseFormat) {
			params.response_format = responseFormat;
		}

		return params;
	}

	/**
	 * Sends content to the language model for translation.
	 *
	 * Constructs system and user prompts based on detected language.
	 * Automatically applies rate limiting to prevent exceeding API limits,
	 * especially important for free-tier LLM models with strict rate limits.
	 *
	 * @param file Translation file instance
	 * @param content Content to translate (defaults to file.content if not provided)
	 * @param chunkProgress When set, the system prompt notes this body is slice `index` of `total` from one file
	 * @param systemPromptKind Which system prompt to use; YAML metadata uses `frontmatterBatch`
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
		responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["response_format"],
		validationRetryHints: string[] = [],
	): Promise<string> {
		file.documentSourceLanguage ??= await this.resolveDocumentSourceLanguage(file.content);

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
							this.getLLMCompletionParams(
								file,
								contentToTranslate,
								chunkProgress,
								systemPromptKind,
								responseFormat,
								validationRetryHints,
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

						const finishReason = completion.choices[0]?.finish_reason;
						if (finishReason === "length") {
							throw new AbortError(
								new ApplicationError(
									"Language model response ended at max completion tokens (truncated output)",
									ErrorCode.TranslationFailed,
									`${TranslatorService.name}.${this.callLanguageModel.name}`,
									{
										model: this.model,
										contentLength: contentToTranslate.length,
										finishReason,
										completionTokens: completion.usage?.completion_tokens,
										promptTokens: completion.usage?.prompt_tokens,
									},
								),
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
						if (error instanceof APIError) {
							if (
								error.status === StatusCodes.UNAUTHORIZED ||
								error.status === StatusCodes.BAD_REQUEST
							) {
								throw new AbortError(error);
							}

							if (isOpenRouterDailyFreeModelQuotaError(error)) {
								file.logger.error(
									{
										model: this.model,
										message: error.message,
									},
									"OpenRouter free-models-per-day limit reached; add credits, drop :free, or wait for the daily reset",
								);
								throw new AbortError(error);
							}
						}

						throw error;
					}
				},
				{
					...this.retryConfig,
					onFailedAttempt: async ({ attemptNumber: attempt, error, retriesLeft }) => {
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

						const resetWaitMs = getRateLimitResetWaitMs(error);
						if (resetWaitMs > 0) {
							file.logger.info({ resetWaitMs }, "Waiting for LLM rate limit window before retry");
							await new Promise<void>((resolve) => setTimeout(resolve, resetWaitMs));
						}
					},
				},
			);
		});
	}

	/**
	 * Creates the system prompt that defines translation rules and requirements.
	 *
	 * @param file Translation file instance
	 * @param userMessageContent User message body for placeholder checks (verbatim fence hints)
	 * @param chunkProgress When set, documents that `userMessageContent` is one slice of a larger markdown body
	 * @param systemPromptKind Document translation vs batched YAML metadata JSON (see {@link TranslationSystemPromptKind})
	 *
	 * @returns The system prompt string
	 */
	private getSystemPrompt(
		file: TranslationFile,
		userMessageContent: string,
		chunkProgress?: ChunkTranslationProgress,
		systemPromptKind: TranslationSystemPromptKind = "markdownDocument",
		validationRetryHints: string[] = [],
	) {
		const documentSourceLanguage = file.documentSourceLanguage ?? "en";

		this.logger.debug({ systemPromptKind }, "Generating system prompt for translation");

		const languages = {
			target: this.services.languageDetector.getLanguageName(
				LanguageDetectorService.languages.target,
			),
			source: this.services.languageDetector.getLanguageName(documentSourceLanguage, false),
		};

		this.logger.debug(
			{ documentSourceLanguage, languages },
			"Determined source and target languages for prompt",
		);

		if (systemPromptKind === "frontmatterBatch") {
			return this.buildFrontmatterBatchSystemPrompt(languages);
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

		const validationRetrySection =
			validationRetryHints.length > 0 ?
				`
				# CORRECTION REQUIRED (previous attempt failed validation)
				A previous translation of this content was rejected. Apply every correction below in a new full translation of the user message:
				${validationRetryHints.map((hint) => `- ${hint}`).join("\n")}
				`
			:	"";

		const builtSystemPrompt = `# ROLE
				You are an expert technical translator specializing in React documentation.
	
				# TASK
				Translate the provided content from ${languages.source} to ${languages.target} with absolute precision and technical accuracy.
				${chunkSliceSection}
				${validationRetrySection}
				# CRITICAL PRESERVATION RULES
				1. **Structure & Formatting**: Preserve ALL markdown syntax, HTML tags, code blocks, frontmatter, and line breaks exactly as written
				2. **Code & identifiers**: Keep ALL code examples, URLs, and every programming identifier (functions, variables, classes, hooks, packages, props as in code) unchanged in every context—fenced blocks, inline code, tables, lists, or prose
				3. **Content Completeness**: Translate EVERY piece of text content WITHOUT adding, removing, or omitting anything
				4. **Whitespace Integrity**: ALWAYS preserve blank lines, especially after horizontal rules (---). The pattern '---\n\n##' must remain '---\n\n##' and never become '---\n##'
	
				# TRANSLATION GUIDELINES
				## What to Translate
				- Natural language text and documentation content
				- Code comments and string literals (when they contain user-facing text)
				- Alt text, titles, and descriptive content
	
				## What NOT to Translate
				- API endpoints; URLs, paths, and configuration values; technical terms unless the translation guidelines map them
				- YAML frontmatter key names; the \`title\` value is not machine-translated; only a string \`description\` value may be translated in a dedicated pass after the body
	
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
			userMessageContent.includes("<!-- translate-react:verbatim-fence-") ?
				`
				# VERBATIM SOURCE PLACEHOLDERS
				Some fenced code regions were replaced with HTML comments matching \`<!-- translate-react:verbatim-fence-N -->\`.
				Copy each placeholder comment EXACTLY into your output at the same position; never translate, remove, reorder, or alter these comments.
				`
			:	"";

		return builtSystemPrompt + verbatimPlaceholderSection;
	}

	/**
	 * Builds the system prompt for batched YAML frontmatter string translation with structured JSON output.
	 *
	 * Embeds the same glossary and locale rules as the markdown body pass (as silent reference) so
	 * the `description` field stays aligned with body terminology without echoing the glossary into free text.
	 *
	 * @param languages Human-readable source and target language names for the TASK section
	 *
	 * @returns The system prompt string for the frontmatter batch completion
	 */
	private buildFrontmatterBatchSystemPrompt(languages: { source: string; target: string }) {
		const termReferenceSection =
			this.translationGuidelines ?
				`
				# TERM REFERENCE (DO NOT OUTPUT)
				Use only for consistent terminology when translating each \`source\` string. Never copy, quote, translate, summarize, or repeat this reference in your reply JSON.
	
				${this.translationGuidelines}
				`
			:	"";

		return `# ROLE
				You are an expert technical translator for React documentation YAML metadata.
	
				# TASK
				The user message is a single JSON object with an \`items\` array of length 1. The element has \`fieldKey\` "description" and \`source\` (the English string to translate). Translate \`source\` from ${languages.source} to ${languages.target}.
	
				# OUTPUT (STRICT)
				- Reply with JSON only, matching the response schema: an object \`items\` whose length equals the request, each item having \`fieldKey\` (same as input) and \`translated\` (the translated string only).
				- Do not add markdown, code fences, or commentary outside the JSON object.
				- Preserve intentional internal line breaks in a string only when the corresponding \`source\` already uses multiple lines you must keep.
	
				# RULES
				- Translate only natural language in each \`source\` value
				- Keep programming identifiers, proper nouns, versions, code-like tokens, and URLs unchanged unless the term reference explicitly maps them
				- Never translate the JSON keys \`fieldKey\`, \`source\`, \`items\`, or \`translated\` themselves
	
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
