import { RequestError } from "@octokit/request-error";
import { StatusCodes } from "http-status-codes";

import { ErrorCode, ErrorHelper, ErrorSeverity, TranslationError } from "@/errors/";
import { detectRateLimit, logger } from "@/utils/";

export class GithubErrorHelper implements ErrorHelper {
	/**
	 * Maps GitHub RequestError to appropriate {@link TranslationError} with context.
	 *
	 * Handles common GitHub API error scenarios:
	 * - 401 Unauthorized
	 * - 403 Forbidden (including rate limits)
	 * - 404 Not Found
	 * - 422 Unprocessable Entity
	 * - 5xx Server Errors
	 *
	 * @param error The error to map
	 * @param context Additional context to include in the error
	 *
	 * @returns A `TranslationError` with appropriate code and context
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   await octokit.repos.get({ owner, repo });
	 * } catch (error) {
	 *   throw new GithubErrorHelper().mapError(error, {
	 *     operation: 'GitHubService.getRepository',
	 *     metadata: { owner, repo }
	 *   });
	 * }
	 * ```
	 */
	public mapError(
		error: unknown,
		context: {
			operation: string;
			metadata?: Record<string, unknown>;
		},
	): TranslationError {
		/** Handle Octokit's RequestError type with status code mapping */
		if (error instanceof RequestError) {
			const errorCode = this.getErrorCodeFromStatus(error);
			const severity = this.getSeverityFromCode(errorCode);

			logger.error(
				{
					err: error,
					operation: context.operation,
					statusCode: error.status,
					errorCode,
					...context.metadata,
				},
				"GitHub API error",
			);

			return new TranslationError(error.message, errorCode, {
				sanity: severity,
				operation: context.operation,
				metadata: {
					statusCode: error.status,
					requestId: error.response?.headers?.["x-github-request-id"],
					...context.metadata,
				},
			});
		}

		/** Handle generic Error instances with rate limit detection */
		if (error instanceof Error) {
			if (detectRateLimit(error.message)) {
				logger.warn(
					{
						err: error,
						operation: context.operation,
						...context.metadata,
					},
					"Rate limit detected in error message",
				);

				return new TranslationError(error.message, ErrorCode.RateLimitExceeded, {
					sanity: ErrorSeverity.Warn,
					operation: context.operation,
					metadata: context.metadata,
				});
			}

			logger.error(
				{
					err: error,
					operation: context.operation,
					...context.metadata,
				},
				"Unexpected error",
			);

			return new TranslationError(error.message, ErrorCode.UnknownError, {
				sanity: ErrorSeverity.Error,
				operation: context.operation,
				metadata: context.metadata,
			});
		}

		/** Handle non-Error objects thrown as exceptions */
		const message = String(error);
		logger.error(
			{
				error: message,
				operation: context.operation,
				...context.metadata,
			},
			"Non-Error object thrown",
		);

		return new TranslationError(message, ErrorCode.UnknownError, {
			sanity: ErrorSeverity.Error,
			operation: context.operation,
			metadata: context.metadata,
		});
	}

	public getErrorCodeFromStatus(error: RequestError): ErrorCode {
		switch (error.status) {
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
				if (!error.status) return ErrorCode.GithubApiError;

				return ErrorCode.GithubApiError;
		}
	}

	public getSeverityFromCode(code: ErrorCode): ErrorSeverity {
		switch (code) {
			case ErrorCode.RateLimitExceeded:
				return ErrorSeverity.Warn;
			case ErrorCode.GithubNotFound:
			case ErrorCode.ValidationError:
				return ErrorSeverity.Info;
			case ErrorCode.GithubServerError:
			case ErrorCode.GithubApiError:
				return ErrorSeverity.Error;
			case ErrorCode.GithubUnauthorized:
			case ErrorCode.GithubForbidden:
				return ErrorSeverity.Fatal;
			default:
				return ErrorSeverity.Error;
		}
	}
}
