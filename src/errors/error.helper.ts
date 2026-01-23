import { RequestError } from "@octokit/request-error";
import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";

import { logger as baseLogger, detectRateLimit } from "@/utils/";

import { ApplicationError, ErrorCode } from "./error";

/** Base metadata fields added by mapError for all error types */
export interface GithubErrorBaseMetadata {
	/** HTTP status code from GitHub response */
	statusCode?: number;

	/** GitHub request ID from response headers */
	requestId?: string;
}

/** Base metadata fields added by mapError for all error types */
export interface LLMErrorBaseMetadata {
	/** Original error message */
	originalMessage?: string;

	/** Type of the error (if available) */
	errorType?: string;

	/** String representation of the error (for non-Error types) */
	error?: string;
}

/** Additional metadata fields added for APIError instances */
export interface LLMApiErrorMetadata extends LLMErrorBaseMetadata {
	/** HTTP status code from LLM API response */
	statusCode: number;

	/** Specific error type from LLM API (if available) */
	type: string | undefined;
}

/**
 * Maps errors to {@link ApplicationError} with appropriate error codes.
 *
 * @param error The error to map
 * @param operation The operation that failed
 * @param metadata Optional additional debugging context
 *
 * @returns An `ApplicationError` with appropriate code and context
 *
 * @example
 * ```typescript
 * // GitHub API error mapping
 * try {
 *   await octokit.repos.get({ owner, repo });
 * } catch (error) {
 *   throw mapError(error, "GitHubService.getRepository", { owner, repo });
 * }
 * ```
 *
 * @example
 * ```typescript
 * // LLM API error mapping
 * try {
 *   await openai.chat.completions.create({ ... });
 * } catch (error) {
 *   throw mapError(error, "TranslatorService.callLanguageModel", {
 *     model: "gpt-4",
 *     contentLength: 1500
 *   });
 * }
 * ```
 *
 * @example
 * ```typescript
 * // General error mapping
 * try {
 *   const response = await someService.performAction();
 * } catch (error) {
 *   throw mapError(error, "SomeService.someOperation", { additional: "context" });
 * }
 * ```
 */
export function mapError<T extends Record<string, unknown> = Record<string, unknown>>(
	error: unknown,
	operation: string,
	metadata: T = {} as T,
): ApplicationError<
	(GithubErrorBaseMetadata & T) | (LLMErrorBaseMetadata & LLMApiErrorMetadata & T) | T
> {
	const logger = baseLogger.child({ component: mapError.name });

	logger.debug({ error, operation, metadata }, "Mapping error to ApplicationError");

	if (error instanceof RequestError || isUncastRequestError(error)) {
		const errorCode = getGithubErrorCode(error);

		const errorMetadata = {
			...metadata,
			statusCode: error.status,
			requestId: error.response?.headers["x-github-request-id"],
		} as GithubErrorBaseMetadata & T;

		logger.error({ error, operation, errorCode, errorMetadata }, "GitHub API error");

		return new ApplicationError(error.message, errorCode, operation, errorMetadata);
	}

	if (error instanceof APIError || isUncastAPIError(error)) {
		const isRateLimit = detectRateLimit(error.message, error.status as StatusCodes);
		const errorCode = isRateLimit ? ErrorCode.RateLimitExceeded : ErrorCode.LLMApiError;

		const errorMetadata = {
			...metadata,
			statusCode: Number(error.status),
			type: error.type,
			originalMessage: error.message,
		} as LLMErrorBaseMetadata & LLMApiErrorMetadata & T;

		logger.error(
			{ operation, errorCode, errorType: error.type, isRateLimit, errorMetadata },
			"LLM API error",
		);

		return new ApplicationError(error.message, errorCode, operation, errorMetadata);
	}

	if (error instanceof Error) {
		if (detectRateLimit(error.message)) {
			logger.warn({ error, operation, metadata }, "Rate limit detected in error message");

			return new ApplicationError(error.message, ErrorCode.RateLimitExceeded, operation, metadata);
		}

		logger.error({ error, operation, metadata }, "Unexpected error");

		return new ApplicationError(error.message, ErrorCode.UnknownError, operation, metadata);
	}

	logger.error({ error: String(error), operation, metadata }, "Unknown non-error Exception");

	return new ApplicationError(String(error), ErrorCode.UnknownError, operation, metadata);
}

/**
 * Determines the appropriate {@link ErrorCode} based on GitHub status code.
 *
 * @param error The {@link RequestError} from Octokit
 *
 * @returns The appropriate {@link ErrorCode}
 */
function getGithubErrorCode(error: RequestError): ErrorCode {
	switch (error.status as StatusCodes) {
		case StatusCodes.UNAUTHORIZED:
			return ErrorCode.GithubUnauthorized;
		case StatusCodes.FORBIDDEN:
			if (detectRateLimit(error.message, error.status)) {
				return ErrorCode.RateLimitExceeded;
			}

			return ErrorCode.GithubForbidden;
		case StatusCodes.NOT_FOUND:
			return ErrorCode.GithubNotFound;
		case StatusCodes.UNPROCESSABLE_ENTITY:
			return ErrorCode.ValidationError;
		case StatusCodes.INTERNAL_SERVER_ERROR:
		case StatusCodes.BAD_GATEWAY:
		case StatusCodes.SERVICE_UNAVAILABLE:
		case StatusCodes.GATEWAY_TIMEOUT:
			return ErrorCode.GithubServerError;
		default:
			return ErrorCode.GithubApiError;
	}
}

/**
 * Exhaustively checks wether the provided error is an uncast {@link RequestError}
 *
 * @param error The error to check
 *
 * @returns `true` if the error matches {@link RequestError}'s shape, `false` otherwise
 */
function isUncastRequestError(error: unknown): error is RequestError {
	return (
		typeof error === "object" &&
		error != null &&
		"name" in error &&
		error.name === "HttpError" &&
		"status" in error &&
		typeof error.status === "number" &&
		"request" in error &&
		typeof error.request === "object" &&
		error.request != null &&
		"method" in error.request &&
		"url" in error.request &&
		"headers" in error.request
	);
}

/**
 * Exhaustively checks wether the provided error is an uncast {@link APIError}
 *
 * @param error The error to check
 *
 * @returns `true` if the error matches {@link APIError}'s shape, `false` otherwise
 */
function isUncastAPIError(error: unknown): error is APIError {
	return (
		typeof error === "object" &&
		error != null &&
		"name" in error &&
		error.name === "APIError" &&
		"status" in error &&
		typeof error.status === "number" &&
		"error" in error &&
		"type" in error &&
		"code" in error &&
		"param" in error &&
		"headers" in error &&
		"request_id" in error
	);
}
