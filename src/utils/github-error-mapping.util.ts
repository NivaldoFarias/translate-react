import { RequestError } from "@octokit/request-error";
import { StatusCodes } from "http-status-codes";

import type { ProxyHandlerOptions } from "@/errors/proxy.handler";

import { ErrorCode } from "@/errors/base.error";

/**
 * Creates error mapping for GitHub API errors.
 * Maps specific GitHub error types to more descriptive error codes.
 *
 * This utility function centralizes GitHub API error handling by mapping
 * Octokit's RequestError instances to our internal error codes based on
 * HTTP status codes and error messages.
 *
 * @returns Error mapping for GitHub API errors
 *
 * @example
 * ```typescript
 * const errorMap = createGitHubErrorMap();
 * const proxy = createErrorHandlingProxy(service, {
 *   serviceName: 'GitHubService',
 *   errorMap
 * });
 * ```
 */
export function createGitHubErrorMap(): ProxyHandlerOptions["errorMap"] {
	const errorMap: ProxyHandlerOptions["errorMap"] = new Map();

	errorMap.set("RequestError", {
		code: ErrorCode.GITHUB_API_ERROR,
		transform: (error: Error) => {
			const requestError = error as RequestError;

			switch (requestError.status) {
				case StatusCodes.UNAUTHORIZED:
					return { code: ErrorCode.GITHUB_UNAUTHORIZED };
				case StatusCodes.FORBIDDEN:
					if (requestError.message.toLowerCase().includes("rate limit")) {
						return { code: ErrorCode.GITHUB_RATE_LIMITED };
					}
					return { code: ErrorCode.GITHUB_FORBIDDEN };
				case StatusCodes.NOT_FOUND:
					return { code: ErrorCode.GITHUB_NOT_FOUND };
				case StatusCodes.UNPROCESSABLE_ENTITY:
					return { code: ErrorCode.VALIDATION_ERROR };
				case StatusCodes.INTERNAL_SERVER_ERROR:
				case StatusCodes.BAD_GATEWAY:
				case StatusCodes.SERVICE_UNAVAILABLE:
				case StatusCodes.GATEWAY_TIMEOUT:
					return { code: ErrorCode.GITHUB_SERVER_ERROR };
				default:
					return {
						code: ErrorCode.GITHUB_API_ERROR,
						metadata: {
							networkError: !requestError.status,
							originalError: requestError.message,
						},
					};
			}
		},
	});

	return errorMap;
}
