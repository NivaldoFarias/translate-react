import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";
import { zodResponseFormat } from "openai/helpers/zod";
import pRetry, { AbortError } from "p-retry";

import type OpenAI from "openai";

import type { TranslationAttemptContext } from "@/services/translator/pipeline/translation-attempt.context";
import type { TranslationFile } from "@/services/translator/translation-file";
import type { FrontmatterBatchFieldKey } from "@/services/translator/translator-frontmatter-batch.schema";

import type { TranslationLlmClientDependencies } from "./translation-llm.client.types";
import type {
	ChunkTranslationProgress,
	TranslationSystemPromptKind,
} from "./translation-system-prompt.types";

import { ApplicationError, ErrorCode } from "@/errors/";
import {
	frontmatterBatchRequestEnvelopeSchema,
	frontmatterBatchTranslationEnvelopeSchema,
} from "@/services/translator/translator-frontmatter-batch.schema";
import { getRateLimitResetWaitMs, isOpenRouterDailyFreeModelQuotaError } from "@/utils/";

import { emptyTranslationAttemptContext } from "../pipeline/translation-attempt.context";
import { LLM_TEMPERATURE } from "../translator.constants";

/** Structured-output schema for batched YAML `description` translation (OpenRouter/OpenAI JSON mode). */
const FRONTMATTER_BATCH_RESPONSE_FORMAT = zodResponseFormat(
	frontmatterBatchTranslationEnvelopeSchema,
	"frontmatter_batch_translations",
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
	 * @param attemptContext Guard hints from a failed validation attempt
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
	 * @param attemptContext Guard hints from a failed validation attempt
	 *
	 * @throws {ApplicationError} When the model returns empty or truncated content
	 *
	 * @returns Resolves to the translated content
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
	 * @throws {ApplicationError} When the model returns empty, truncated, or invalid JSON
	 *
	 * @returns Parsed envelope matching {@link frontmatterBatchTranslationEnvelopeSchema}
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
	 * Builds `p-retry` `onFailedAttempt` that waits for rate-limit reset windows when present.
	 *
	 * @param file File used for retry logging
	 * @param callStartTime Timestamp when the queued call started
	 * @param contentLength Content length included in retry logs
	 * @param attemptLabel Short label for log messages
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
			file.logger.warn(
				{
					attempt,
					retriesLeft,
					error: error instanceof Error ? error.message : String(error),
					totalElapsedMs: Date.now() - callStartTime,
					contentLength,
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
