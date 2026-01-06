import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";

import { ApplicationError, ErrorCode } from "@/errors/base-error";
import { detectRateLimit, logger } from "@/utils/";

const helperLogger = logger.child({ component: "LLMErrorHelper" });

/** Base metadata fields added by mapLLMError for all error types */
interface LLMErrorBaseMetadata {
	/** Original error message */
	originalMessage?: string;

	/** Type of the error (if available) */
	errorType?: string;

	/** String representation of the error (for non-Error types) */
	error?: string;
}

/** Additional metadata fields added for APIError instances */
interface LLMApiErrorMetadata extends LLMErrorBaseMetadata {
	/** HTTP status code from LLM API response */
	statusCode: number;

	/** Specific error type from LLM API (if available) */
	type: string | undefined;
}

/**
 * Maps LLM/OpenAI errors to {@link ApplicationError} with proper classification.
 *
 * Handles rate limit detection, API errors, and unknown errors with structured logging.
 *
 * @param error The error to map
 * @param operation The operation that failed
 * @param metadata Optional additional debugging context
 *
 * @returns `ApplicationError` instance with appropriate code and metadata
 *
 * @example
 * ```typescript
 * try {
 *   await openai.chat.completions.create({ ... });
 * } catch (error) {
 *   throw mapLLMError(error, "TranslatorService.callLanguageModel", {
 *     model: "gpt-4",
 *     contentLength: 1500
 *   });
 * }
 * ```
 */
export function mapLLMError<T extends Record<string, unknown> = Record<string, never>>(
	error: unknown,
	operation: string,
	metadata?: T,
): ApplicationError<LLMErrorBaseMetadata & LLMApiErrorMetadata & T> {
	type CombinedMetadata = LLMErrorBaseMetadata & LLMApiErrorMetadata & T;

	if (error instanceof APIError) {
		const isRateLimit = detectRateLimit(error.message, error.status as StatusCodes);
		const errorCode = isRateLimit ? ErrorCode.RateLimitExceeded : ErrorCode.LLMApiError;

		const errorMetadata = {
			statusCode: Number(error.status),
			type: error.type,
			originalMessage: error.message,
			...metadata,
		} as CombinedMetadata;

		helperLogger.error(
			{ operation, errorCode, errorType: error.type, isRateLimit, statusCode: error.status },
			"LLM API error",
		);

		return new ApplicationError(error.message, errorCode, operation, errorMetadata);
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

			return new ApplicationError(error.message, ErrorCode.RateLimitExceeded, operation, {
				errorType,
				originalMessage: error.message,
				...metadata,
			} as CombinedMetadata);
		}

		helperLogger.error(
			{ operation, errorCode: ErrorCode.UnknownError, errorType },
			"Unknown LLM error",
		);

		return new ApplicationError(error.message, ErrorCode.UnknownError, operation, {
			errorType,
			originalMessage: error.message,
			...metadata,
		} as CombinedMetadata);
	}

	const errorString = String(error);

	helperLogger.error(
		{ operation, errorCode: ErrorCode.UnknownError, errorValue: errorString },
		"Unknown non-Error LLM exception",
	);

	return new ApplicationError(errorString, ErrorCode.UnknownError, operation, {
		error: errorString,
		...metadata,
	} as CombinedMetadata);
}
