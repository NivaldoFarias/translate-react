import { Octokit } from "@octokit/rest";

/** Optional Pino-style hooks for Octokit request logging */
export interface OctokitLogHooks {
	debug: (message: string) => void;
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
}

/** Options for {@link createOctokit} without app env or retry logic */
export interface CreateOctokitOptions {
	auth: string;
	requestTimeoutMs: number;
	log?: OctokitLogHooks;
}

/**
 * Creates a bare Octokit REST client (auth, timeout, optional log hooks only).
 *
 * @param options Auth token, request timeout, and optional log hooks
 *
 * @returns Configured {@link Octokit} instance
 *
 * @example
 * ```typescript
 * const client = createOctokit({
 *   auth: token,
 *   requestTimeoutMs: 30_000,
 * });
 * ```
 */
export function createOctokit(options: CreateOctokitOptions): Octokit {
	return new Octokit({
		auth: options.auth,
		request: { timeout: options.requestTimeoutMs },
		...(options.log ? { log: options.log } : {}),
	});
}
