import { RequestError } from "@octokit/request-error";
import { StatusCodes } from "http-status-codes";

import type { TranslationErrorContext } from "@/errors/base-error";

import { ErrorCode, TranslationError } from "@/errors/base-error";
import { detectRateLimit, logger } from "@/utils/";

const helperLogger = logger.child({ component: "GithubErrorHelper" });

/**
 * Maps GitHub errors to {@link TranslationError} with appropriate error codes.
 *
 * Handles common GitHub API error scenarios:
 * - 401 Unauthorized
 * - 403 Forbidden (including rate limits)
 * - 404 Not Found
 * - 422 Unprocessable Entity
 * - 5xx Server Errors
 *
 * @param error The error to map
 * @param context Context with operation name and optional metadata
 *
 * @returns A `TranslationError` with appropriate code and context
 *
 * @example
 * ```typescript
 * try {
 *   await octokit.repos.get({ owner, repo });
 * } catch (error) {
 *   throw mapGithubError(error, {
 *     operation: "GitHubService.getRepository",
 *     metadata: { owner, repo }
 *   });
 * }
 * ```
 */
export function mapGithubError<T extends Record<string, unknown> = Record<string, unknown>>(
	error: unknown,
	context: TranslationErrorContext<T>,
): TranslationError<T & { statusCode?: number; requestId?: string }> {
	const { operation, metadata } = context;

	if (error instanceof RequestError) {
		const errorCode = getGithubErrorCode(error);

		helperLogger.error(
			{ error, operation, statusCode: error.status, errorCode, ...metadata },
			"GitHub API error",
		);

		return new TranslationError(error.message, errorCode, {
			operation,
			metadata: {
				...metadata,
				statusCode: error.status,
				requestId: error.response?.headers["x-github-request-id"],
			} as T & { statusCode: number; requestId: string | undefined },
		});
	}

	if (error instanceof Error) {
		if (detectRateLimit(error.message)) {
			helperLogger.warn({ error, operation, ...metadata }, "Rate limit detected in error message");

			return new TranslationError(error.message, ErrorCode.RateLimitExceeded, {
				operation,
				metadata: metadata as T & { statusCode?: number; requestId?: string },
			});
		}

		helperLogger.error({ error, operation, ...metadata }, "Unexpected error");

		return new TranslationError(error.message, ErrorCode.UnknownError, {
			operation,
			metadata: metadata as T & { statusCode?: number; requestId?: string },
		});
	}

	const message = String(error);
	helperLogger.error({ error: message, operation, ...metadata }, "Non-Error object thrown");

	return new TranslationError(message, ErrorCode.UnknownError, {
		operation,
		metadata: metadata as T & { statusCode?: number; requestId?: string },
	});
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
