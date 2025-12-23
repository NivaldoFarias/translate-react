import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";

import type { TranslationErrorContext } from "@/errors/base-error";

import { ErrorCode, TranslationError } from "@/errors/base-error";
import { detectRateLimit, logger } from "@/utils/";

const helperLogger = logger.child({ component: "LLMErrorHelper" });

/**
 * Maps LLM/OpenAI errors to {@link TranslationError} with proper classification.
 *
 * Handles rate limit detection, API errors, and unknown errors with structured logging.
 *
 * @param error The error to map
 * @param context Context with operation name and optional metadata
 *
 * @returns `TranslationError` instance with appropriate code and metadata
 *
 * @example
 * ```typescript
 * try {
 *   await openai.chat.completions.create({ ... });
 * } catch (error) {
 *   throw mapLLMError(error, {
 *     operation: "TranslatorService.callLanguageModel",
 *     metadata: { model: "gpt-4", contentLength: 1500 }
 *   });
 * }
 * ```
 */
export function mapLLMError<T extends Record<string, unknown> = Record<string, unknown>>(
	error: unknown,
	context: TranslationErrorContext<T>,
): TranslationError {
	const { operation, metadata } = context;

	if (error instanceof APIError) {
		const isRateLimit = detectRateLimit(error.message, error.status as StatusCodes);
		const errorCode = isRateLimit ? ErrorCode.RateLimitExceeded : ErrorCode.LLMApiError;

		const errorMetadata = {
			statusCode: error.status as number,
			type: error.type,
			originalMessage: error.message,
			...metadata,
		};

		helperLogger.error(
			{ operation, errorCode, errorType: error.type, isRateLimit, statusCode: error.status },
			"LLM API error",
		);

		return new TranslationError(error.message, errorCode, {
			operation,
			metadata: errorMetadata,
		});
	}

	if (error instanceof Error) {
		const errorType = error.constructor.name;

		const isKnownRateLimitError =
			errorType === "RateLimitError" ||
			errorType === "QuotaExceededError" ||
			errorType === "TooManyRequestsError";

		const hasRateLimitPattern = detectRateLimit(error.message);

		if (isKnownRateLimitError || hasRateLimitPattern) {
			helperLogger.error(
				{ operation, errorCode: ErrorCode.RateLimitExceeded, errorType },
				"Rate limit exceeded",
			);

			return new TranslationError(error.message, ErrorCode.RateLimitExceeded, {
				operation,
				metadata: { errorType, originalMessage: error.message, ...metadata },
			});
		}

		helperLogger.error(
			{ operation, errorCode: ErrorCode.UnknownError, errorType },
			"Unknown LLM error",
		);

		return new TranslationError(error.message, ErrorCode.UnknownError, {
			operation,
			metadata: { errorType, originalMessage: error.message, ...metadata },
		});
	}

	const errorString = String(error);

	helperLogger.error(
		{ operation, errorCode: ErrorCode.UnknownError, errorValue: errorString },
		"Unknown non-Error LLM exception",
	);

	return new TranslationError(errorString, ErrorCode.UnknownError, {
		operation,
		metadata: { error: errorString, ...metadata },
	});
}
