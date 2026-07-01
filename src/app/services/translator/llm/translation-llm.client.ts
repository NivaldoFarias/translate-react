import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";
import { zodResponseFormat } from "openai/helpers/zod";
import pRetry, { AbortError } from "p-retry";

import type OpenAI from "openai";

import type { TranslationAttemptContext } from "@/app/services/translator/pipeline/translation-attempt.context";
import type { TranslationFile } from "@/app/services/translator/translation-file";
import type { FrontmatterBatchFieldKey } from "@/app/services/translator/translator-frontmatter-batch.schema";
import type { SegmentBatchRequestItem } from "@/app/services/translator/translator-segment-batch.schema";

import type { TranslationLlmClientDependencies } from "./translation-llm.client.types";
import type { TranslationLlmUsageSnapshot } from "./translation-llm.usage";
import type {
	ChunkTranslationProgress,
	TranslationSystemPromptKind,
} from "./translation-system-prompt.types";

import {
	frontmatterBatchRequestEnvelopeSchema,
	frontmatterBatchTranslationEnvelopeSchema,
} from "@/app/services/translator/translator-frontmatter-batch.schema";
import {
	segmentBatchRequestEnvelopeSchema,
	segmentBatchTranslationEnvelopeSchema,
} from "@/app/services/translator/translator-segment-batch.schema";
import {
	buildOpenRouterRunUserId,
	getRateLimitResetWaitMs,
	isOpenRouterDailyFreeModelQuotaError,
} from "@/app/utils/";
import { ApplicationError, ErrorCode, isSegmentBatchSplittableError } from "@/shared/errors/";

import { emptyTranslationAttemptContext } from "../pipeline/translation-attempt.context";
import {
	LLM_TEMPERATURE,
	SEGMENT_BATCH_MAX_PARTIAL_FOLLOW_UP_ROUNDS,
} from "../translator.constants";

import {
	analyzeSegmentBatchIdMismatch,
	isPartialSegmentBatchRetryEligible,
	SEGMENT_BATCH_ID_MISMATCH_RECOVERY_OPTIONS,
} from "./segment-batch-id-match.util";
import {
	buildOpaqueSegmentBatchPayload,
	remapOpaqueSegmentBatchResponseItems,
} from "./segment-batch-opaque-id.util";
import {
	extractTranslationLlmUsageFromCompletion,
	mergeTranslationLlmUsageSnapshots,
} from "./translation-llm.usage";

/** LLM completion text plus optional usage for run statistics */
export interface TranslationLlmCallResult {
	/** Model output text */
	content: string;

	/** Token and cost usage when the provider returned it */
	usage: TranslationLlmUsageSnapshot | null;
}

/** Structured-output schema for batched YAML `description` translation (OpenRouter/OpenAI JSON mode). */
const FRONTMATTER_BATCH_RESPONSE_FORMAT = zodResponseFormat(
	frontmatterBatchTranslationEnvelopeSchema,
	"frontmatter_batch_translations",
);

/** Structured-output schema for batched prose segment translation (OpenRouter/OpenAI JSON mode). */
const SEGMENT_BATCH_RESPONSE_FORMAT = zodResponseFormat(
	segmentBatchTranslationEnvelopeSchema,
	"segment_batch_translations",
);

/**
 * OpenAI transport for markdown and frontmatter translation completions.
 *
 * Owns rate-limited chat completion calls, retries, and shared API error handling.
 */
export class TranslationLlmClient {
	private readonly openai: OpenAI;
	private readonly model: string;
	private readonly queue: TranslationLlmClientDependencies["queue"];
	private readonly retryConfig: TranslationLlmClientDependencies["retryConfig"];
	private readonly promptBuilder: TranslationLlmClientDependencies["promptBuilder"];
	private readonly estimateInputTokens: TranslationLlmClientDependencies["estimateInputTokens"];
	private readonly getCompletionTokenCap: TranslationLlmClientDependencies["getCompletionTokenCap"];
	private readonly resolveDocumentSourceLanguage: TranslationLlmClientDependencies["resolveDocumentSourceLanguage"];
	private readonly getTranslationGuidelines: TranslationLlmClientDependencies["getTranslationGuidelines"];

	/**
	 * @param dependencies OpenAI client, queue, retry policy, and prompt helpers
	 */
	constructor(dependencies: TranslationLlmClientDependencies) {
		this.openai = dependencies.openai;
		this.model = dependencies.model;
		this.queue = dependencies.queue;
		this.retryConfig = dependencies.retryConfig;
		this.promptBuilder = dependencies.promptBuilder;
		this.estimateInputTokens = dependencies.estimateInputTokens;
		this.getCompletionTokenCap = dependencies.getCompletionTokenCap;
		this.resolveDocumentSourceLanguage = dependencies.resolveDocumentSourceLanguage;
		this.getTranslationGuidelines = dependencies.getTranslationGuidelines;
	}

	/**
	 * Checks if an LLM API response is valid for connectivity tests.
	 *
	 * @param response LLM API response to check
	 *
	 * @returns `true` when the response has an id, usage, and a message
	 *
	 * @example
	 * ```typescript
	 * const ok = client.isLLMResponseValid(completion);
	 * if (!ok) throw new Error("Invalid LLM API response");
	 * ```
	 */
	public isLLMResponseValid(response: OpenAI.Chat.Completions.ChatCompletion) {
		return Boolean(
			response.id &&
			typeof response.usage?.total_tokens === "number" &&
			response.choices.at(0)?.message,
		);
	}

	/**
	 * Prepares parameters for LLM chat completion API call.
	 *
	 * @param file Translation file instance
	 * @param userMessageContent User message sent to the model
	 * @param chunkProgress Optional slice position when translating a chunked body
	 * @param systemPromptKind Which system prompt to build
	 * @param responseFormat Optional structured output format
	 * @param attemptContext Maintainer feedback for the system prompt, when present
	 *
	 * @returns Chat completion parameters object
	 */
	public getLLMCompletionParams(
		file: TranslationFile,
		userMessageContent: string,
		chunkProgress?: ChunkTranslationProgress,
		systemPromptKind: TranslationSystemPromptKind = "markdownDocument",
		responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["response_format"],
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
		const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
			model: this.model,
			temperature: LLM_TEMPERATURE,
			max_tokens: this.getCompletionTokenCap(),
			messages: [
				{
					role: "system",
					content: this.promptBuilder.buildSystemPrompt(
						{
							file,
							userMessageContent,
							chunkProgress,
							attemptContext,
							translationGuidelines: this.getTranslationGuidelines(),
						},
						systemPromptKind,
					),
				},
				{ role: "user", content: userMessageContent },
			],
		};

		if (responseFormat) {
			params.response_format = responseFormat;
		}

		// eslint-disable-next-line @typescript-eslint/no-deprecated -- OpenRouter run attribution
		params.user = buildOpenRouterRunUserId();

		return params;
	}

	/**
	 * Sends content to the language model for translation.
	 *
	 * @param file Translation file instance
	 * @param content Content to translate (defaults to `file.content`)
	 * @param chunkProgress When set, notes this body is slice `index` of `total`
	 * @param systemPromptKind Which system prompt to use
	 * @param responseFormat Optional structured output format
	 * @param attemptContext Maintainer feedback for the system prompt, when present
	 *
	 * @returns Resolves to the translated content
	 *
	 * @throws {ApplicationError} When the model returns empty or truncated content
	 */
	public async callLanguageModel(
		file: TranslationFile,
		content?: string,
		chunkProgress?: ChunkTranslationProgress,
		systemPromptKind: TranslationSystemPromptKind = "markdownDocument",
		responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["response_format"],
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
	) {
		file.documentSourceLanguage ??= await this.resolveDocumentSourceLanguage(file.content);

		const contentToTranslate = content ?? file.content;

		return this.queue.add(async () => {
			const callStartTime = Date.now();
			const estimatedInputTokens = this.estimateInputTokens(contentToTranslate);

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
								attemptContext,
							),
						);

						const translatedContent = completion.choices[0]?.message.content;

						if (!translatedContent) {
							throw new ApplicationError(
								"No content returned from language model",
								ErrorCode.NoContent,
								`${TranslationLlmClient.name}.${this.callLanguageModel.name}`,
								{ model: this.model, contentLength: contentToTranslate.length },
							);
						}

						const finishReason = completion.choices[0]?.finish_reason;
						if (finishReason === "length") {
							throw new AbortError(
								new ApplicationError(
									"Language model response ended at max completion tokens (truncated output)",
									ErrorCode.TranslationFailed,
									`${TranslationLlmClient.name}.${this.callLanguageModel.name}`,
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

						const usage = extractTranslationLlmUsageFromCompletion(completion.usage);

						file.logger.debug(
							{
								completionId: completion.id,
								model: this.model,
								durationMs: Date.now() - attemptStartTime,
								finishReason: completion.choices[0]?.finish_reason ?? null,
								inputTokens: usage?.promptTokens,
								outputTokens: usage?.completionTokens,
								totalTokens: usage?.totalTokens,
								costUsd: usage?.costUsd,
								translatedLength: translatedContent.length,
							},
							"LLM API call successful",
						);

						return { content: translatedContent, usage };
					} catch (error) {
						this.rethrowNonRetryableApiError(error, file);
						throw error;
					}
				},
				{
					...this.retryConfig,
					onFailedAttempt: this.createRateLimitAwareRetryHandler(
						file,
						callStartTime,
						contentToTranslate.length,
						"LLM call",
					),
				},
			);
		});
	}

	/**
	 * Translates YAML frontmatter string fields in one structured LLM completion.
	 *
	 * @param file Logical document being translated
	 * @param batchItems Field keys and source strings to translate
	 *
	 * @returns Parsed envelope matching {@link frontmatterBatchTranslationEnvelopeSchema}
	 *
	 * @throws {ApplicationError} When the model returns empty, truncated, or invalid JSON
	 */
	public async callLanguageModelFrontmatterBatch(
		file: TranslationFile,
		batchItems: readonly { fieldKey: FrontmatterBatchFieldKey; source: string }[],
	) {
		file.documentSourceLanguage ??= await this.resolveDocumentSourceLanguage(file.content);

		const requestPayload = frontmatterBatchRequestEnvelopeSchema.parse({ items: batchItems });
		const userMessage = JSON.stringify(requestPayload);
		const contentLengthForLog = userMessage.length;

		return this.queue.add(async () => {
			const callStartTime = Date.now();
			const estimatedInputTokens = this.estimateInputTokens(userMessage);

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
								`${TranslationLlmClient.name}.${this.callLanguageModelFrontmatterBatch.name}`,
								{ model: this.model, contentLength: contentLengthForLog },
							);
						}

						const finishReason = completion.choices[0]?.finish_reason;
						if (finishReason === "length") {
							throw new ApplicationError(
								"Language model response ended at max completion tokens (truncated frontmatter batch JSON)",
								ErrorCode.TranslationFailed,
								`${TranslationLlmClient.name}.${this.callLanguageModelFrontmatterBatch.name}`,
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
								`${TranslationLlmClient.name}.${this.callLanguageModelFrontmatterBatch.name}`,
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
								`${TranslationLlmClient.name}.${this.callLanguageModelFrontmatterBatch.name}`,
								{
									requested: [...requestedKeys],
									received: [...responseKeys],
								},
							);
						}

						const usage = extractTranslationLlmUsageFromCompletion(completion.usage);

						file.logger.debug(
							{
								completionId: completion.id,
								model: this.model,
								durationMs: Date.now() - attemptStartTime,
								finishReason: completion.choices[0]?.finish_reason ?? null,
								inputTokens: usage?.promptTokens,
								outputTokens: usage?.completionTokens,
								totalTokens: usage?.totalTokens,
								costUsd: usage?.costUsd,
								fieldCount: parsedEnvelope.data.items.length,
							},
							"LLM frontmatter batch call successful",
						);

						return { envelope: parsedEnvelope.data, usage };
					} catch (error) {
						if (error instanceof SyntaxError) {
							throw new ApplicationError(
								"Frontmatter batch response was not valid JSON",
								ErrorCode.TranslationFailed,
								`${TranslationLlmClient.name}.${this.callLanguageModelFrontmatterBatch.name}`,
								{ model: this.model, parseError: error.message },
							);
						}

						this.rethrowNonRetryableApiError(error, file);
						throw error;
					}
				},
				{
					...this.retryConfig,
					onFailedAttempt: this.createRateLimitAwareRetryHandler(
						file,
						callStartTime,
						contentLengthForLog,
						"LLM frontmatter batch",
					),
				},
			);
		});
	}

	/**
	 * Translates prose markdown segments in one structured LLM completion.
	 *
	 * @param file Logical document being translated
	 * @param batchItems Segment ids and source strings to translate
	 * @param attemptContext Maintainer feedback for the system prompt, when present
	 *
	 * @returns Parsed envelope matching {@link segmentBatchTranslationEnvelopeSchema}
	 *
	 * @throws {ApplicationError} When the model returns empty, truncated, or invalid JSON
	 *
	 * @example
	 * ```typescript
	 * const { envelope, usage } = await client.callLanguageModelSegmentBatch(file, [
	 *   { segmentId: "root/paragraph#0", source: "Hello world" },
	 * ], attemptContext);
	 * ```
	 */
	public async callLanguageModelSegmentBatch(
		file: TranslationFile,
		batchItems: readonly SegmentBatchRequestItem[],
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
	) {
		file.documentSourceLanguage ??= await this.resolveDocumentSourceLanguage(file.content);

		const requestPayload = segmentBatchRequestEnvelopeSchema.parse({ items: batchItems });
		const userMessage = JSON.stringify(requestPayload);
		const contentLengthForLog = userMessage.length;

		return this.queue.add(async () => {
			const callStartTime = Date.now();

			return pRetry(
				async () => {
					try {
						return await this.translateSegmentBatchCompletingAllIds(
							file,
							batchItems,
							attemptContext,
							contentLengthForLog,
						);
					} catch (error) {
						this.rethrowNonRetryableApiError(error, file);
						this.abortRetryWhenSegmentBatchSplittable(error);
						throw error;
					}
				},
				{
					...this.retryConfig,
					onFailedAttempt: this.createRateLimitAwareRetryHandler(
						file,
						callStartTime,
						contentLengthForLog,
						"LLM segment batch",
					),
				},
			);
		});
	}

	/**
	 * Translates a segment batch, following up with missing ids only when the model drops items.
	 *
	 * @param file Logical document being translated
	 * @param batchItems Full segment batch request items for this logical call
	 * @param attemptContext Maintainer feedback for the system prompt, when present
	 * @param contentLengthForLog Serialized request length for logging
	 *
	 * @returns Parsed envelope with every requested segment id and merged usage
	 */
	private async translateSegmentBatchCompletingAllIds(
		file: TranslationFile,
		batchItems: readonly SegmentBatchRequestItem[],
		attemptContext: TranslationAttemptContext,
		contentLengthForLog: number,
	) {
		const translations = new Map<string, string>();
		let pendingItems = [...batchItems];
		let aggregatedUsage: ReturnType<typeof extractTranslationLlmUsageFromCompletion> = null;
		let partialFollowUpRound = 0;
		const batchCallStartTime = Date.now();

		while (pendingItems.length > 0) {
			const { llmItems, realSegmentIdByOpaqueId } = buildOpaqueSegmentBatchPayload(pendingItems);
			const pendingUserMessage = JSON.stringify(
				segmentBatchRequestEnvelopeSchema.parse({ items: llmItems }),
			);

			file.logger.debug(
				{
					contentLength: pendingUserMessage.length,
					estimatedInputTokens: this.estimateInputTokens(pendingUserMessage),
					model: this.model,
					systemPromptKind: "segmentBatch",
					segmentCount: pendingItems.length,
					...(partialFollowUpRound > 0 ?
						{
							partialFollowUpRound,
							originalSegmentCount: batchItems.length,
						}
					:	{}),
				},
				partialFollowUpRound > 0 ?
					"Calling LLM API for missing segment batch items"
				:	"Calling LLM API for batched prose segments",
			);

			const { envelope, usage, completionContext } = await this.performSingleSegmentBatchLlmCall(
				file,
				pendingItems,
				pendingUserMessage,
				attemptContext,
				contentLengthForLog,
				partialFollowUpRound,
			);
			aggregatedUsage = mergeTranslationLlmUsageSnapshots(aggregatedUsage, usage);

			const remappedItems = remapOpaqueSegmentBatchResponseItems(
				envelope.items,
				realSegmentIdByOpaqueId,
			);

			for (const item of remappedItems) {
				if (pendingItems.some((pendingItem) => pendingItem.segmentId === item.segmentId)) {
					translations.set(item.segmentId, item.translated);
				}
			}

			const stillMissing = batchItems.filter((item) => !translations.has(item.segmentId));

			if (stillMissing.length === 0) {
				file.logger.debug(
					{
						model: this.model,
						durationMs: Date.now() - batchCallStartTime,
						inputTokens: aggregatedUsage?.promptTokens,
						outputTokens: aggregatedUsage?.completionTokens,
						totalTokens: aggregatedUsage?.totalTokens,
						costUsd: aggregatedUsage?.costUsd,
						segmentCount: batchItems.length,
						partialFollowUpRounds: partialFollowUpRound,
					},
					"LLM segment batch call successful",
				);

				return {
					envelope: {
						items: batchItems.map((item) => ({
							segmentId: item.segmentId,
							translated: translations.get(item.segmentId) ?? "",
						})),
					},
					usage: aggregatedUsage,
				};
			}

			const idMismatch = analyzeSegmentBatchIdMismatch(pendingItems, remappedItems);

			if (!isPartialSegmentBatchRetryEligible(idMismatch)) {
				this.throwSegmentBatchIdMismatchError(
					file,
					batchItems.length,
					idMismatch,
					completionContext,
				);
			}

			if (partialFollowUpRound >= SEGMENT_BATCH_MAX_PARTIAL_FOLLOW_UP_ROUNDS) {
				const receivedItems = batchItems
					.filter((item) => translations.has(item.segmentId))
					.map((item) => ({ segmentId: item.segmentId }));

				this.throwSegmentBatchIdMismatchError(
					file,
					batchItems.length,
					analyzeSegmentBatchIdMismatch(batchItems, receivedItems),
					completionContext,
				);
			}

			file.logger.info(
				{
					originalSegmentCount: batchItems.length,
					pendingSegmentCount: stillMissing.length,
					partialFollowUpRound: partialFollowUpRound + 1,
					missingIds: stillMissing.map((item) => item.segmentId),
				},
				"Retrying segment batch with missing ids only",
			);

			pendingItems = stillMissing;
			partialFollowUpRound += 1;
		}

		throw new ApplicationError(
			"Segment batch translation produced no items",
			ErrorCode.TranslationFailed,
			`${TranslationLlmClient.name}.${this.translateSegmentBatchCompletingAllIds.name}`,
			{ model: this.model, segmentCount: batchItems.length },
		);
	}

	/**
	 * Performs one segment-batch LLM completion and parses structured JSON output.
	 *
	 * @param file Logical document being translated
	 * @param batchItems Segment batch items for this provider call
	 * @param userMessage Serialized request envelope
	 * @param attemptContext Maintainer feedback for the system prompt, when present
	 * @param contentLengthForLog Original full-batch content length for error metadata
	 * @param partialFollowUpRound Zero-based count of prior partial batch follow-up rounds
	 *
	 * @returns Parsed response envelope, usage snapshot, and completion log context
	 */
	private async performSingleSegmentBatchLlmCall(
		file: TranslationFile,
		batchItems: readonly SegmentBatchRequestItem[],
		userMessage: string,
		attemptContext: TranslationAttemptContext,
		contentLengthForLog: number,
		partialFollowUpRound = 0,
	) {
		const attemptStartTime = Date.now();

		const completion = await this.openai.chat.completions.create(
			this.getLLMCompletionParams(
				file,
				userMessage,
				undefined,
				"segmentBatch",
				SEGMENT_BATCH_RESPONSE_FORMAT,
				attemptContext,
			),
		);

		const completionContext = this.buildSegmentBatchCompletionLogContext(completion);
		const rawJson = completion.choices[0]?.message.content;

		if (!rawJson) {
			throw new ApplicationError(
				"No content returned from language model for segment batch",
				ErrorCode.NoContent,
				`${TranslationLlmClient.name}.${this.callLanguageModelSegmentBatch.name}`,
				{ model: this.model, contentLength: contentLengthForLog },
			);
		}

		if (completionContext.finishReason === "length") {
			const truncationMetadata = {
				model: this.model,
				contentLength: contentLengthForLog,
				segmentCount: batchItems.length,
				...completionContext,
			};

			file.logger.warn(
				truncationMetadata,
				"Segment batch response truncated at max completion tokens",
			);

			throw new ApplicationError(
				"Language model response ended at max completion tokens (truncated output)",
				ErrorCode.TranslationFailed,
				`${TranslationLlmClient.name}.${this.callLanguageModelSegmentBatch.name}`,
				truncationMetadata,
			);
		}

		let parsedEnvelope: ReturnType<typeof segmentBatchTranslationEnvelopeSchema.safeParse>;

		try {
			parsedEnvelope = segmentBatchTranslationEnvelopeSchema.safeParse(JSON.parse(rawJson));
		} catch (error) {
			if (error instanceof SyntaxError) {
				const invalidJsonMetadata = {
					model: this.model,
					segmentCount: batchItems.length,
					parseError: error.message,
					rawJsonLength: rawJson.length,
					...completionContext,
				};

				file.logger.warn(invalidJsonMetadata, "Segment batch response was not valid JSON");

				throw new ApplicationError(
					"Segment batch response was not valid JSON",
					ErrorCode.TranslationFailed,
					`${TranslationLlmClient.name}.${this.callLanguageModelSegmentBatch.name}`,
					invalidJsonMetadata,
				);
			}

			throw error;
		}

		if (!parsedEnvelope.success) {
			const schemaFailureMetadata = {
				model: this.model,
				segmentCount: batchItems.length,
				issues: parsedEnvelope.error.issues,
				...completionContext,
			};

			file.logger.warn(schemaFailureMetadata, "Segment batch response failed schema validation");

			throw new ApplicationError(
				"Segment batch response failed schema validation",
				ErrorCode.TranslationFailed,
				`${TranslationLlmClient.name}.${this.callLanguageModelSegmentBatch.name}`,
				schemaFailureMetadata,
			);
		}

		const usage = extractTranslationLlmUsageFromCompletion(completion.usage);
		const subCallDurationMs = Date.now() - attemptStartTime;

		file.logger.debug(
			{
				completionId: completion.id,
				model: this.model,
				durationMs: subCallDurationMs,
				finishReason: completionContext.finishReason,
				inputTokens: usage?.promptTokens,
				outputTokens: usage?.completionTokens,
				totalTokens: usage?.totalTokens,
				costUsd: usage?.costUsd,
				segmentCount: batchItems.length,
				...(partialFollowUpRound > 0 ? { partialFollowUpRound } : {}),
			},
			"LLM segment batch sub-call successful",
		);

		return {
			envelope: parsedEnvelope.data,
			usage,
			completionContext,
		};
	}

	/**
	 * Logs and throws a segment batch id mismatch after diagnostics are computed.
	 *
	 * @param file Logical document being translated
	 * @param segmentCount Original batch segment count for metadata
	 * @param idMismatch Request vs response id diff
	 * @param completionContext Token and finish-reason fields from the provider
	 */
	private throwSegmentBatchIdMismatchError(
		file: TranslationFile,
		segmentCount: number,
		idMismatch: ReturnType<typeof analyzeSegmentBatchIdMismatch>,
		completionContext: ReturnType<TranslationLlmClient["buildSegmentBatchCompletionLogContext"]>,
	) {
		const idMismatchMetadata = {
			model: this.model,
			segmentCount,
			segmentBatchIdMismatch: idMismatch,
			recoveryOptions: [...SEGMENT_BATCH_ID_MISMATCH_RECOVERY_OPTIONS],
			...completionContext,
		};

		file.logger.warn(
			idMismatchMetadata,
			"Segment batch response ids do not match requested segments",
		);

		throw new ApplicationError(
			"Segment batch response ids do not match requested segments",
			ErrorCode.TranslationFailed,
			`${TranslationLlmClient.name}.${this.callLanguageModelSegmentBatch.name}`,
			idMismatchMetadata,
		);
	}

	/**
	 * Aborts `p-retry` when the caller recovers via segment batch splitting.
	 *
	 * Truncation, id mismatches, and malformed or schema-invalid JSON are not fixed by
	 * repeating the same payload; the translator splits the batch instead.
	 *
	 * @param error Caught rejection from segment batch translation
	 *
	 * @throws {AbortError} When {@link isSegmentBatchSplittableError} is true
	 */
	private abortRetryWhenSegmentBatchSplittable(error: unknown): void {
		if (!isSegmentBatchSplittableError(error)) {
			return;
		}

		throw new AbortError(error as Error);
	}

	/**
	 * Maps auth, bad-request, and OpenRouter quota errors to non-retrying `AbortError`.
	 *
	 * @param error Caught error from an LLM attempt
	 * @param file File used for quota logging context
	 */
	private rethrowNonRetryableApiError(error: unknown, file: TranslationFile) {
		if (error instanceof APIError) {
			if (error.status === StatusCodes.UNAUTHORIZED || error.status === StatusCodes.BAD_REQUEST) {
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
	}

	/**
	 * Extracts token and finish-reason fields from a segment batch completion for failure logs.
	 *
	 * @param completion Chat completion returned by the provider
	 *
	 * @returns Structured fields for warn/debug logging on segment batch failures
	 */
	private buildSegmentBatchCompletionLogContext(
		completion: OpenAI.Chat.Completions.ChatCompletion,
	) {
		return {
			completionId: completion.id,
			finishReason: completion.choices[0]?.finish_reason ?? null,
			promptTokens: completion.usage?.prompt_tokens,
			completionTokens: completion.usage?.completion_tokens,
			totalTokens: completion.usage?.total_tokens,
		};
	}

	/**
	 * Unwraps an {@link ApplicationError} from a `p-retry` rejection when present.
	 *
	 * @param error Rejection passed to `onFailedAttempt`
	 *
	 * @returns Application error to merge into retry logs, or `undefined`
	 */
	private extractApplicationErrorFromRetryFailure(error: unknown) {
		if (error instanceof ApplicationError) {
			return error;
		}

		if (error instanceof AbortError && error.originalError instanceof ApplicationError) {
			return error.originalError;
		}

		return undefined;
	}

	/**
	 * Builds `p-retry` `onFailedAttempt` that waits for rate-limit reset windows when present.
	 *
	 * @param file File used for retry logging
	 * @param callStartTime Timestamp when the queued call started
	 * @param contentLength Content length included in retry logs
	 * @param attemptLabel Short label for log messages
	 *
	 * @returns `p-retry` `onFailedAttempt` callback that honors rate-limit reset headers
	 */
	private createRateLimitAwareRetryHandler(
		file: TranslationFile,
		callStartTime: number,
		contentLength: number,
		attemptLabel: string,
	) {
		return async ({
			attemptNumber: attempt,
			error,
			retriesLeft,
		}: {
			attemptNumber: number;
			error: Error;
			retriesLeft: number;
		}) => {
			const applicationError = this.extractApplicationErrorFromRetryFailure(error);

			file.logger.warn(
				{
					attempt,
					retriesLeft,
					error: error instanceof Error ? error.message : String(error),
					totalElapsedMs: Date.now() - callStartTime,
					contentLength,
					...(applicationError?.metadata ? { failureMetadata: applicationError.metadata } : {}),
				},
				`${attemptLabel} attempt ${attempt} failed, ${retriesLeft} retries remaining`,
			);

			const resetWaitMs = getRateLimitResetWaitMs(error);
			if (resetWaitMs > 0) {
				file.logger.info({ resetWaitMs }, "Waiting for LLM rate limit window before retry");
				await new Promise<void>((resolve) => setTimeout(resolve, resetWaitMs));
			}
		};
	}
}
