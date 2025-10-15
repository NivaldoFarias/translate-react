/**
 * @fileoverview
 *
 * Helper utilities for mapping LLM errors to TranslationError instances.
 *
 * Provides explicit error mapping for OpenAI API errors with rate limit detection,
 * replacing the proxy-based error handling pattern with clear, maintainable code.
 */

import { RequestError } from "@octokit/request-error";
import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";

import { ErrorCode, ErrorHelper, ErrorSeverity, TranslationError } from "@/errors/";
import { detectRateLimit, logger } from "@/utils/";

/** Context for LLM error mapping operations */
interface LLMErrorContext {
	/** Operation that triggered the error (e.g., `"TranslatorService.callLanguageModel"`) */
	operation: string;

	/** Additional metadata for debugging and logging */
	metadata?: Record<string, unknown>;
}

export class LLMErrorHelper implements ErrorHelper {
	/**
	 * Maps LLM/OpenAI errors to {@link TranslationError} with proper classification and logging.
	 *
	 * Handles rate limit detection, API errors, and unknown errors with structured
	 * Pino logging for observability.
	 *
	 * @param error The error to map
	 * @param context Context information for error mapping
	 *
	 * @returns `TranslationError` instance with appropriate code and metadata
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   await openai.chat.completions.create({ ... });
	 * } catch (error) {
	 *   throw new LLMErrorHelper().mapError(error, {
	 *     operation: "TranslatorService.callLanguageModel",
	 *     metadata: { model: "gpt-4", contentLength: 1500 }
	 *   });
	 * }
	 * ```
	 */
	public mapError(error: unknown, context: LLMErrorContext): TranslationError {
		const { operation, metadata = {} } = context;

		/** Handle OpenAI APIError instances */
		if (error instanceof APIError) {
			const isRateLimit = detectRateLimit(error.message, error.status);

			const errorCode = isRateLimit ? ErrorCode.RateLimitExceeded : ErrorCode.LLMApiError;
			const severity = this.getSeverityFromCode(errorCode);

			const errorMetadata = {
				statusCode: error.status,
				type: error.type,
				originalMessage: error.message,
				...metadata,
			};

			logger.error(
				{
					operation,
					errorCode,
					severity,
					errorType: error.type,
					isRateLimit,
					...errorMetadata,
				},
				"LLM API error",
			);

			return new TranslationError(error.message, errorCode, {
				operation,
				metadata: errorMetadata,
			});
		}

		/** Handle standard Error instances with rate limit detection */
		if (error instanceof Error) {
			const errorType = error.constructor.name;

			/** Check for known rate limit error types */
			const isKnownRateLimitError =
				errorType === "RateLimitError" ||
				errorType === "QuotaExceededError" ||
				errorType === "TooManyRequestsError";

			/** Check message content for rate limit patterns */
			const hasRateLimitPattern = detectRateLimit(error.message);

			if (isKnownRateLimitError || hasRateLimitPattern) {
				logger.error(
					{
						operation,
						errorCode: ErrorCode.RateLimitExceeded,
						severity: ErrorSeverity.Error,
						errorType,
						originalMessage: error.message,
						...metadata,
					},
					"Rate limit exceeded",
				);

				return new TranslationError(error.message, ErrorCode.RateLimitExceeded, {
					operation,
					metadata: {
						errorType,
						originalMessage: error.message,
						...metadata,
					},
				});
			}

			/** Generic error handling for unknown Error types */
			logger.error(
				{
					operation,
					errorCode: ErrorCode.UnknownError,
					severity: ErrorSeverity.Warn,
					errorType,
					originalMessage: error.message,
					...metadata,
				},
				"Unknown LLM error",
			);

			return new TranslationError(error.message, ErrorCode.UnknownError, {
				operation,
				metadata: {
					errorType,
					originalMessage: error.message,
					...metadata,
				},
			});
		}

		/** Handle non-Error objects */
		const errorString = String(error);

		logger.error(
			{
				operation,
				errorCode: ErrorCode.UnknownError,
				severity: ErrorSeverity.Warn,
				error: errorString,
				...metadata,
			},
			"Unknown non-Error LLM exception",
		);

		return new TranslationError(errorString, ErrorCode.UnknownError, {
			operation,
			metadata: {
				error: errorString,
				...metadata,
			},
		});
	}

	public getErrorCodeFromStatus(error: RequestError): ErrorCode {
		switch (error.status) {
			case StatusCodes.UNAUTHORIZED:
				return ErrorCode.Unauthorized;
			case StatusCodes.FORBIDDEN:
				if (error.message.toLowerCase().includes("rate limit")) {
					return ErrorCode.RateLimitExceeded;
				}
				return ErrorCode.Forbidden;
			case StatusCodes.NOT_FOUND:
				return ErrorCode.NotFound;
			case StatusCodes.UNPROCESSABLE_ENTITY:
				return ErrorCode.ValidationError;
			case StatusCodes.INTERNAL_SERVER_ERROR:
			case StatusCodes.BAD_GATEWAY:
			case StatusCodes.SERVICE_UNAVAILABLE:
			case StatusCodes.GATEWAY_TIMEOUT:
				return ErrorCode.ServerError;
			default:
				if (!error.status) return ErrorCode.ApiError;

				return ErrorCode.ApiError;
		}
	}

	public getSeverityFromCode(code: ErrorCode): ErrorSeverity {
		switch (code) {
			case ErrorCode.RateLimitExceeded:
				return ErrorSeverity.Error;
			case ErrorCode.LLMApiError:
				return ErrorSeverity.Error;
			case ErrorCode.UnknownError:
				return ErrorSeverity.Warn;
			default:
				return ErrorSeverity.Info;
		}
	}
}
