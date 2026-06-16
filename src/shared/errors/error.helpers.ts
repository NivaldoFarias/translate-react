import { RequestError } from "@octokit/request-error";
import { APIError } from "openai/error";
import { AbortError } from "p-retry";

import type { Logger } from "pino";

import type { TranslatorService } from "@/app/services/translator";

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
 * @param logger Logger instance to use for fatal output
 *
 * @example
 * ```typescript
 * try {
 *   await runWorkflow();
 * } catch (error) {
 *   handleTopLevelError(error, logger);
 *   process.exit(1);
 * }
 * ```
 */
export function handleTopLevelError(error: unknown, logger: Logger): void {
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
 * Returns whether `error` is a max-completion-token truncation from the translator.
 *
 * Matches {@link ApplicationError} with a truncated-output message, including when
 * wrapped in {@link AbortError} from `p-retry`.
 *
 * @param error Caught rejection from {@link TranslatorService.callLanguageModel}
 *
 * @returns `true` when the model stopped at the completion token limit
 */
export function isCompletionLengthTruncationError(error: unknown) {
	if (error instanceof ApplicationError && error.code === ErrorCode.TranslationFailed) {
		return error.message.includes("truncated output");
	}

	if (error instanceof AbortError) {
		return isCompletionLengthTruncationError(error.originalError);
	}

	return false;
}

/**
 * Returns whether `error` is a segment batch id mismatch after LLM structured output validation.
 *
 * @param error Caught rejection from segment batch translation
 *
 * @returns `true` when requested and response segment ids do not match
 */
export function isSegmentBatchIdMismatchError(error: unknown) {
	if (error instanceof ApplicationError && error.code === ErrorCode.TranslationFailed) {
		return error.message === "Segment batch response ids do not match requested segments";
	}

	if (error instanceof AbortError) {
		return isSegmentBatchIdMismatchError(error.originalError);
	}

	return false;
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
