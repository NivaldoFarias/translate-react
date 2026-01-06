import { RequestError } from "@octokit/request-error";
import { StatusCodes } from "http-status-codes";

import { ApplicationError, ErrorCode } from "@/errors/base-error";
import { detectRateLimit, logger } from "@/utils/";

const helperLogger = logger.child({ component: "GithubErrorHelper" });

/** Base metadata fields added by mapGithubError for all error types */
interface GithubErrorBaseMetadata {
	/** HTTP status code from GitHub response */
	statusCode?: number;

	/** GitHub request ID from response headers */
	requestId?: string;
}

/**
 * Maps GitHub errors to {@link ApplicationError} with appropriate error codes.
 *
 * Handles common GitHub API error scenarios:
 * - `401` Unauthorized
 * - `403` Forbidden (including rate limits)
 * - `404` Not Found
 * - `422` Unprocessable Entity
 * - `5xx` Server Errors
 *
 * @param error The error to map
 * @param operation The operation that failed
 * @param metadata Optional additional debugging context
 *
 * @returns A `ApplicationError` with appropriate code and context
 *
 * @example
 * ```typescript
 * try {
 *   await octokit.repos.get({ owner, repo });
 * } catch (error) {
 *   throw mapGithubError(error, "GitHubService.getRepository", { owner, repo });
 * }
 * ```
 */
export function mapGithubError<T extends Record<string, unknown> = Record<string, never>>(
	error: unknown,
	operation: string,
	metadata?: T,
): ApplicationError<GithubErrorBaseMetadata & T> {
	type CombinedMetadata = GithubErrorBaseMetadata & T;

	if (error instanceof RequestError) {
		const errorCode = getGithubErrorCode(error);

		helperLogger.error(
			{ error, operation, statusCode: error.status, errorCode, ...metadata },
			"GitHub API error",
		);

		return new ApplicationError(error.message, errorCode, operation, {
			...metadata,
			statusCode: error.status,
			requestId: error.response?.headers["x-github-request-id"],
		} as CombinedMetadata);
	}

	if (error instanceof Error) {
		if (detectRateLimit(error.message)) {
			helperLogger.warn({ error, operation, ...metadata }, "Rate limit detected in error message");

			return new ApplicationError(
				error.message,
				ErrorCode.RateLimitExceeded,
				operation,
				metadata as CombinedMetadata,
			);
		}

		helperLogger.error({ error, operation, ...metadata }, "Unexpected error");

		return new ApplicationError(
			error.message,
			ErrorCode.UnknownError,
			operation,
			metadata as CombinedMetadata,
		);
	}

	const message = String(error);
	helperLogger.error({ error: message, operation, ...metadata }, "Non-Error object thrown");

	return new ApplicationError(
		message,
		ErrorCode.UnknownError,
		operation,
		metadata as CombinedMetadata,
	);
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
			if (error.message.toLowerCase().includes("rate limit")) {
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
