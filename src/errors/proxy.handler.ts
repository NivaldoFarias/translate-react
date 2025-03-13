import type { ErrorContext } from "./base.error";

import TranslationFile from "@/utils/translation-file.util";

import { ErrorCode, TranslationError } from "./base.error";
import { ErrorHandler } from "./error.handler";

/** Configuration options for creating an error-handling proxy */
export interface ProxyHandlerOptions {
	/**
	 * The name of the service or class being proxied.
	 * Used for error context and logging
	 */
	serviceName: string;

	/** Optional additional context to include with all errors */
	baseContext?: Partial<ErrorContext>;

	/** Methods that should be excluded from error handling */
	excludeMethods?: string[];

	/** Error mapping for specific error types */
	errorMap?: Map<string, { code: ErrorCode; transform?: (error: Error) => Partial<ErrorContext> }>;
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
 *     ['HttpError', { code: ErrorCode.GITHUB_API_ERROR }],
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

			// Only proxy methods, not properties
			if (typeof value !== "function" || excludeMethods.includes(prop.toString())) {
				return value;
			}

			// Return a wrapped version of the method
			return function (...args: unknown[]) {
				const methodName = prop.toString();
				const context: Partial<ErrorContext> = {
					operation: `${serviceName}.${methodName}`,
					...baseContext,
					metadata: {
						...baseContext.metadata,
						arguments: args.map((arg) =>
							// Don't include file contents in metadata to avoid bloat
							arg && arg instanceof TranslationFile ? `TranslationFile(${arg.filename})` : arg,
						),
					},
				};

				const handleError = (error: unknown) => {
					// If it's already our error type, just add the context
					if (error instanceof TranslationError) {
						error.context.operation = context.operation;
						error.context.metadata = {
							...error.context.metadata,
							...context.metadata,
						};
						throw error;
					}

					// Check if we have a specific error mapping
					if (error instanceof Error) {
						const errorType = error.constructor.name;
						const mapping = errorMap.get(errorType);
						if (mapping) {
							const additionalContext = mapping.transform?.(error) ?? {};
							throw new TranslationError(error.message, mapping.code, {
								...context,
								...additionalContext,
							});
						}
					}

					// Default error handling
					throw new TranslationError(
						error instanceof Error ? error.message : String(error),
						ErrorCode.UNKNOWN_ERROR,
						context,
					);
				};

				try {
					// Handle async methods
					if (value.constructor.name === "AsyncFunction") {
						return errorHandler.wrapAsync(async () => {
							try {
								return await value.apply(obj, args);
							} catch (error) {
								handleError(error);
							}
						}, context)();
					}

					// Handle synchronous methods
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
