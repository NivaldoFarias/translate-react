import Bun from "bun";

import type { BunFile } from "bun";

import type { ErrorContext } from "./base.error";

import { ErrorHandler } from "./error-handler";

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
}

/**
 * Creates a proxy that automatically wraps all methods of a service with error handling
 *
 * This utility reduces boilerplate by applying error handling to all methods
 * of a service without requiring explicit wrapping of each method.
 *
 * @param target - The service or object to wrap with error handling
 * @param options - Configuration options for the proxy
 *
 * @example
 * ```typescript
 * // Before proxying - errors must be handled manually
 * const githubService = new GitHubService();
 *
 * // After proxying - all methods automatically handle errors
 * const safeGithubService = createErrorHandlingProxy(githubService, {
 *   serviceName: 'GitHubService'
 * });
 *
 * // Now you can call methods directly without try/catch
 * await safeGithubService.createPullRequest(...);
 * ```
 */
export function createErrorHandlingProxy<T extends object>(
	target: T,
	options: ProxyHandlerOptions,
): T {
	const errorHandler = ErrorHandler.getInstance();
	const { serviceName, baseContext = {}, excludeMethods = [] } = options;

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
							arg instanceof Bun.file ? `BunFile(${(arg as BunFile).name})` : arg,
						),
					},
				};

				// Handle async methods
				if (value.constructor.name === "AsyncFunction") {
					return errorHandler.wrapAsync(async () => await value.apply(obj, args), context)();
				}

				// Handle synchronous methods
				return errorHandler.wrapSync(() => value.apply(obj, args), context)();
			};
		},
	});
}
