import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { StatusCodes } from "http-status-codes";
import pRetry, { AbortError } from "p-retry";

import type { Options as RetryOptions } from "p-retry";

import { isUncastRequestError } from "@/errors";
import { logger as baseLogger, env } from "@/utils";

import {
	DEFAULT_RETRY_CONFIG,
	NETWORK_ERROR_PATTERNS,
	RATE_LIMIT_BUFFER_MS,
	RATE_LIMIT_MAX_DELAY_MS,
} from "./octokit.constants";

/** Octokit-specific logger for GitHub API debugging */
const logger = baseLogger.child({ component: "octokit" });

/** Shared Octokit configuration for consistent behavior across clients */
const sharedOctokitConfig = {
	request: { timeout: env.GH_REQUEST_TIMEOUT },
	log: {
		debug: (message: string) => {
			logger.debug(message);
		},
		info: (message: string) => {
			logger.info(message);
		},
		warn: (message: string) => {
			logger.warn(message);
		},
		error: (message: string) => {
			logger.error(message);
		},
	},
} as const;

/** Primary Octokit instance authenticated with GH_TOKEN */
const primaryOctokit = new Octokit({ auth: env.GH_TOKEN, ...sharedOctokitConfig });

/**
 * Fallback Octokit instance authenticated with GH_PAT_TOKEN.
 *
 * Only instantiated when `GH_PAT_TOKEN` is configured. Used to retry requests
 * that fail with 403 due to permission differences between GitHub App tokens
 * and Personal Access Tokens.
 */
const fallbackOctokit =
	env.GH_PAT_TOKEN ? new Octokit({ auth: env.GH_PAT_TOKEN, ...sharedOctokitConfig }) : null;

/**
 * Checks if an error is retryable (5xx server error, network error, or rate limit).
 *
 * @param error The error to check
 *
 * @returns `true` if the error should trigger a retry
 */
function isRetryableError(error: unknown): boolean {
	if (error instanceof RequestError || isUncastRequestError(error)) {
		const status = error.status as StatusCodes;
		const isRateLimited = status === StatusCodes.TOO_MANY_REQUESTS;
		const isServerError =
			status >= StatusCodes.INTERNAL_SERVER_ERROR &&
			status < StatusCodes.NETWORK_AUTHENTICATION_REQUIRED;

		return isRateLimited || isServerError;
	}

	if (error instanceof Error) {
		return NETWORK_ERROR_PATTERNS.some((pattern) => error.message.includes(pattern));
	}

	return false;
}

/**
 * Extracts retry delay from GitHub's rate limit headers.
 *
 * GitHub uses `Retry-After` (seconds) or `x-ratelimit-reset` (Unix timestamp)
 * to indicate when rate limits will reset.
 *
 * @param error The RequestError containing response headers
 *
 * @returns Delay in milliseconds, or `undefined` if no header found
 */
function getRetryAfterMs(error: RequestError): number | undefined {
	const MS_PER_SECOND = 1000;
	const headers = error.response?.headers;
	if (!headers) return;

	const retryAfterSeconds = String(headers["retry-after"]);
	if (retryAfterSeconds) {
		const seconds = Number.parseInt(retryAfterSeconds, 10);

		if (!Number.isNaN(seconds)) {
			logger.debug({ retryAfterSeconds: seconds }, "Using Retry-After header for delay");
			return seconds * MS_PER_SECOND;
		}
	}

	const rateLimitResetTimestamp = String(headers["x-ratelimit-reset"]);
	if (rateLimitResetTimestamp) {
		const resetTimeMs = Number.parseInt(rateLimitResetTimestamp, 10) * MS_PER_SECOND;
		const delayMs = Math.max(0, resetTimeMs - Date.now() + RATE_LIMIT_BUFFER_MS);

		if (delayMs > 0 && delayMs < RATE_LIMIT_MAX_DELAY_MS) {
			logger.debug({ resetTimeMs, delayMs }, "Using x-ratelimit-reset header for delay");
			return delayMs;
		}
	}

	return;
}

/**
 * Wraps an async function with retry logic for transient GitHub API failures.
 *
 * Automatically retries on:
 * - 5xx server errors
 * - 429 rate limit errors (with Retry-After header support)
 * - Network errors (ECONNRESET, ETIMEDOUT, etc.)
 *
 * Does NOT retry on 4xx client errors (except 429).
 *
 * @param fn The async function to wrap
 * @param operationName Name for logging purposes
 * @param config Optional retry configuration override
 *
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => octokit.repos.get({ owner, repo }),
 *   "repos.get"
 * );
 * ```
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	operationName: string,
	config: RetryOptions = DEFAULT_RETRY_CONFIG,
): Promise<T> {
	return pRetry(
		async () => {
			try {
				return await fn();
			} catch (error) {
				if (!isRetryableError(error)) {
					throw new AbortError(error instanceof Error ? error : new Error(String(error)));
				}

				throw error;
			}
		},
		{
			...config,
			onFailedAttempt: async (failedAttempt) => {
				const { attemptNumber, retriesLeft, error } = failedAttempt;

				if (error instanceof RequestError || isUncastRequestError(error)) {
					const retryAfterMs = getRetryAfterMs(error);
					if (retryAfterMs) {
						logger.warn(
							{
								operation: operationName,
								attempt: attemptNumber,
								retriesLeft,
								status: error.status,
								retryAfterMs,
							},
							`Rate limited, waiting ${Math.ceil(retryAfterMs / 1000)}s before retry`,
						);
						await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
						return;
					}
				}

				logger.warn(
					{
						operation: operationName,
						attempt: attemptNumber,
						retriesLeft,
						error: error instanceof Error ? error.message : String(error),
						status:
							error instanceof RequestError || isUncastRequestError(error) ?
								error.status
							:	undefined,
					},
					`GitHub API call failed, ${retriesLeft} retries remaining`,
				);
			},
		},
	);
}

/** Checks if an error is a 403 Forbidden response */
export function isForbiddenError(error: unknown): error is RequestError {
	return (
		(error instanceof RequestError || isUncastRequestError(error)) &&
		(error.status as StatusCodes) === StatusCodes.FORBIDDEN
	);
}

/** Generic async function type for Octokit API methods */
export type OctokitMethod = (...args: never[]) => Promise<unknown>;

/**
 * Wraps an Octokit API method with retry logic and fallback client support.
 *
 * Provides two layers of resilience:
 * 1. Automatic retry on transient errors (5xx, 429, network issues)
 * 2. Fallback to PAT client on 403 Forbidden errors
 *
 * @param method The original API method from primary client
 * @param fallbackMethod The equivalent method from fallback client
 * @param namespace The API namespace (e.g., "repos", "pulls") for logging
 * @param methodName The method name for logging
 */
export function wrapMethodWithFallback(
	method: OctokitMethod,
	fallbackMethod: OctokitMethod | undefined,
	namespace: string,
	methodName: string,
): OctokitMethod {
	const operationName = `${namespace}.${methodName}`;

	return async (...args) => {
		try {
			return await withRetry(() => method(...args), operationName);
		} catch (error) {
			if (isForbiddenError(error) && fallbackMethod) {
				logger.warn(
					{ namespace, method: methodName },
					"Primary client received 403, retrying with PAT fallback",
				);

				return await withRetry(() => fallbackMethod(...args), `${operationName} (fallback)`);
			}

			throw error;
		}
	};
}

/**
 * Creates a proxy for an Octokit REST API namespace that intercepts method calls.
 *
 * When a method is called, the proxy wraps it to catch 403 errors and retry
 * with the fallback client if configured.
 *
 * @param primaryNamespace The namespace from the primary Octokit instance
 * @param fallbackNamespace The equivalent namespace from the fallback instance (if available)
 * @param namespaceName The namespace name for logging
 */
function createNamespaceProxy<T extends object>(
	primaryNamespace: T,
	fallbackNamespace: T | undefined,
	namespaceName: string,
): T {
	return new Proxy(primaryNamespace, {
		get(target, prop, receiver): unknown {
			const value: unknown = Reflect.get(target, prop, receiver);

			if (typeof value !== "function") {
				return value;
			}

			const methodName = String(prop);
			const fallbackValue: unknown =
				fallbackNamespace ? Reflect.get(fallbackNamespace, prop) : undefined;

			return wrapMethodWithFallback(
				value as OctokitMethod,
				fallbackValue as OctokitMethod | undefined,
				namespaceName,
				methodName,
			);
		},
	});
}

/** REST API namespaces that support fallback behavior */
const REST_NAMESPACES = [
	"repos",
	"pulls",
	"git",
	"issues",
	"rateLimit",
	"rest",
	"request",
] as const;

type RestNamespace = (typeof REST_NAMESPACES)[number];

/**
 * Creates a proxied Octokit instance that transparently falls back to PAT auth on 403 errors.
 *
 * The proxy intercepts calls to REST API namespaces (repos, pulls, git, issues) and
 * retries with the fallback client when the primary client receives a 403 Forbidden response.
 */
function createOctokitWithFallback(): Octokit {
	if (!fallbackOctokit) return primaryOctokit;

	return new Proxy(primaryOctokit, {
		get(target, prop, receiver): unknown {
			const value: unknown = Reflect.get(target, prop, receiver);

			if (REST_NAMESPACES.includes(prop as RestNamespace)) {
				const fallbackNamespace: unknown = Reflect.get(fallbackOctokit, prop);
				return createNamespaceProxy(value as object, fallbackNamespace as object, String(prop));
			}

			return value;
		},
	});
}

/** Pre-configured instance of {@link Octokit} for application-wide use */
export const octokit = createOctokitWithFallback();
