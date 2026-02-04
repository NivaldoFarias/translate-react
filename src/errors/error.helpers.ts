import { RequestError } from "@octokit/request-error";
import { APIError } from "openai/error";

import { logger as baseLogger } from "@/utils/";

import { ApplicationError, ErrorCode } from "./error";

/**
 * Handles top-level errors with structured logging.
 *
 * Provides clean, informative error logging at the application entry point.
 * Handles different error types appropriately:
 * - {@link ApplicationError}: Logs with code, operation, and metadata
 * - Library errors ({@link RequestError}, {@link APIError}): Logs with status codes and context
 * - Generic errors ({@link Error}): Logs with message and stack trace
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

	if (error instanceof RequestError || isUncastRequestError(error)) {
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

	if (error instanceof APIError || isUncastAPIError(error)) {
		logger.fatal(
			{
				errorType: ErrorCode.OpenAIApiError,
				statusCode: error.status,
				message: error.message,
				type: error.type,
				requestId: error.requestID,
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

/**
 * Exhaustively checks wether the provided error is an uncast {@link RequestError}
 *
 * @param error The error to check
 *
 * @returns `true` if the error matches {@link RequestError}'s shape, `false` otherwise
 */
export function isUncastRequestError(error: unknown): error is RequestError {
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
export function isUncastAPIError(error: unknown): error is APIError {
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
		"requestID" in error
	);
}
