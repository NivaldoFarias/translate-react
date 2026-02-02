import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { StatusCodes } from "http-status-codes";

import { isUncastRequestError } from "@/errors";
import { logger as baseLogger, env } from "@/utils";

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
 * Wraps an Octokit API method to retry with fallback client on 403 errors.
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
	return async (...args) => {
		try {
			return await method(...args);
		} catch (error) {
			if (isForbiddenError(error) && fallbackMethod) {
				logger.warn(
					{ namespace, method: methodName },
					"Primary client received 403, retrying with PAT fallback",
				);
				return await fallbackMethod(...args);
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
