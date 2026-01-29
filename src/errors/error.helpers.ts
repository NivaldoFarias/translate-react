import { RequestError } from "@octokit/request-error";
import { APIError } from "openai/error";

import { logger as baseLogger } from "@/utils/";

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
		const errorCode = ErrorCode.OctokitRequestError;

		const errorMetadata = {
			...metadata,
			statusCode: error.status,
			requestId: error.response?.headers["x-github-request-id"],
		} as GithubErrorBaseMetadata & T;

		logger.error({ error, operation, errorCode, errorMetadata }, "Github API error");

		return new ApplicationError(error.message, errorCode, operation, errorMetadata, error.status);
	}

	if (error instanceof APIError || isUncastAPIError(error)) {
		const errorCode = ErrorCode.OpenAIApiError;

		const errorMetadata = {
			...metadata,
			statusCode: Number(error.status),
			type: error.type,
			originalMessage: error.message,
		} as LLMErrorBaseMetadata & LLMApiErrorMetadata & T;

		logger.error({ operation, errorCode, errorType: error.type, errorMetadata }, "LLM API error");

		return new ApplicationError(
			error.message,
			errorCode,
			operation,
			errorMetadata,
			Number(error.status),
		);
	}

	if (error instanceof Error) {
		logger.error({ error, operation, metadata }, "Unexpected error");

		return new ApplicationError(error.message, ErrorCode.UnknownError, operation, metadata);
	}

	logger.error({ error: String(error), operation, metadata }, "Unknown non-error Exception");

	return new ApplicationError(String(error), ErrorCode.UnknownError, operation, metadata);
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

/**
 * Handles top-level errors with structured logging.
 *
 * Provides clean, informative error logging at the application entry point.
 * Handles different error types appropriately:
 * - ApplicationError: Logs with code, operation, and metadata
 * - Library errors (RequestError, APIError): Logs with status codes and context
 * - Generic errors: Logs with message and stack trace
 *
 * @param error The error to handle
 * @param logger Logger instance to use (defaults to base logger)
 *
 * @example
 * ```typescript
 * try {
 *   await runWorkflow();
 * } catch (error) {
 *   handleTopLevelError(error);
 *   process.exit(1);
 * }
 * ```
 */
export function handleTopLevelError(
	error: unknown,
	logger = baseLogger.child({ component: handleTopLevelError.name }),
): void {
	if (error instanceof ApplicationError) {
		const logContext: Record<string, unknown> = {
			errorCode: error.code,
			operation: error.operation,
			message: error.message,
		};

		if (error.statusCode) {
			logContext["statusCode"] = error.statusCode;
		}

		if (error.metadata) {
			logContext["metadata"] = error.metadata;
		}

		logger.fatal(logContext, `Workflow failed: ${error.displayMessage}`);
		return;
	}

	if (error instanceof RequestError) {
		logger.fatal(
			{
				errorType: ErrorCode.OctokitRequestError,
				statusCode: error.status,
				message: error.message,
				requestId: error.response?.headers["x-github-request-id"],
				url: error.request.url,
			},
			`GitHub API error: ${error.message}`,
		);
		return;
	}

	if (error instanceof APIError) {
		logger.fatal(
			{
				errorType: ErrorCode.OpenAIApiError,
				statusCode: error.status,
				message: error.message,
				type: error.type,
				requestId: error.request_id,
			},
			`LLM API error: ${error.message}`,
		);
		return;
	}

	if (error instanceof Error) {
		logger.fatal(
			{
				errorType: ErrorCode.UnknownError,
				message: error.message,
				stack: error.stack,
			},
			`Unexpected error: ${error.message}`,
		);
		return;
	}

	logger.fatal(
		{
			errorType: ErrorCode.UnknownError,
			error: String(error),
		},
		`Unknown error: ${String(error)}`,
	);
}
