import type { ErrorContext } from "./base.error";

import { TranslationFile } from "@/services/translator.service";
import { detectRateLimit } from "@/utils/";

import { ErrorCode, TranslationError } from "./base.error";
import { ErrorHandler } from "./error.handler";

/** Configuration options for creating an error-handling proxy */
export interface ProxyHandlerOptions {
	/** The name of the service or class being proxied */
	serviceName: string;

	/** Optional additional context to include with all errors */
	baseContext?: Partial<ErrorContext>;

	/** Methods that should be excluded from error handling */
	excludeMethods?: string[];

	/** Error mapping for specific error types */
	errorMap?: Map<
		string,
		{
			code: ErrorCode;
			transform?: <T extends Error>(error: T) => Partial<ErrorContext>;
		}
	>;
}

/**
 * Creates a proxy that automatically wraps all methods of a service with error handling
 *
 * This utility reduces boilerplate by applying error handling to all methods
 * of a service without requiring explicit wrapping of each method.
 *
 * @param target The service or object to wrap with error handling
 * @param options Configuration options for the proxy
 *
 * @example
 * ```typescript
 * // Before proxying - errors must be handled manually
 * const githubService = new GitHubService();
 *
 * // After proxying - all methods automatically handle errors
 * const safeGithubService = createErrorHandlingProxy(githubService, {
 *   serviceName: 'GitHubService',
 *   errorMap: new Map([
 *     ['RequestError', { code: ErrorCode.GITHUB_API_ERROR }],
 *     ['RateLimitError', { code: ErrorCode.RATE_LIMIT_EXCEEDED }]
 *   ])
 * });
 * ```
 */
export function createErrorHandlingProxy<T extends object>(
	target: T,
	options: ProxyHandlerOptions,
): T {
	const errorHandler = ErrorHandler.getInstance();
	const { serviceName, baseContext = {}, excludeMethods = [], errorMap = new Map() } = options;

	return new Proxy(target, {
		get(obj, prop) {
			const value = Reflect.get(obj, prop);

			if (typeof value !== "function" || excludeMethods.includes(prop.toString())) {
				return value;
			}

			return function (...args: unknown[]) {
				const methodName = prop.toString();
				const context: Partial<ErrorContext> = {
					operation: `${serviceName}.${methodName}`,
					...baseContext,
					metadata: {
						...baseContext.metadata,
						arguments: args.map((arg) =>
							arg && arg instanceof TranslationFile ? `TranslationFile(${arg.filename})` : arg,
						),
					},
				};

				const handleError = (error: unknown) => {
					if (error instanceof TranslationError) {
						error.context.operation = context.operation;
						error.context.metadata = {
							...error.context.metadata,
							...context.metadata,
						};
						throw error;
					}

					if (error instanceof Error) {
						const errorType = error.constructor.name;
						const mapping = errorMap.get(errorType);
						if (mapping) {
							const additionalContext = mapping.transform?.(error) ?? {};
							const errorCodeToUse = additionalContext.code ?? mapping.code;

							throw new TranslationError(error.message, errorCodeToUse, {
								...context,
								...additionalContext,
							});
						}

						/**
						 * Fallback: Check for rate limit patterns in any error message
						 * This ensures rate limits are caught regardless of error type
						 */
						if (detectRateLimit(error.message)) {
							throw new TranslationError(error.message, ErrorCode.RATE_LIMIT_EXCEEDED, {
								...context,
								metadata: {
									...context.metadata,
									originalMessage: error.message,
									errorType: error.constructor.name,
								},
							});
						}
					}

					throw new TranslationError(
						error instanceof Error ? error.message : String(error),
						ErrorCode.UNKNOWN_ERROR,
						context,
					);
				};

				try {
					if (value.constructor.name === "AsyncFunction") {
						return errorHandler.wrapAsync(async () => {
							try {
								return await value.apply(obj, args);
							} catch (error) {
								handleError(error);
							}
						}, context)();
					}

					return errorHandler.wrapSync(() => {
						try {
							return value.apply(obj, args);
						} catch (error) {
							handleError(error);
						}
					}, context)();
				} catch (error) {
					handleError(error);
				}
			};
		},
	});
}
