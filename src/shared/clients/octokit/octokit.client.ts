import { Octokit } from "@octokit/rest";

/** Optional Pino-style hooks for Octokit request logging */
export interface OctokitLogHooks {
	/** Logs debug-level Octokit messages */
	debug: (message: string) => void;
	/** Logs info-level Octokit messages */
	info: (message: string) => void;
	/** Logs warning-level Octokit messages */
	warn: (message: string) => void;
	/** Logs error-level Octokit messages */
	error: (message: string) => void;
}

/** Options for {@link createOctokit} without app env or retry logic */
export interface CreateOctokitOptions {
	/** GitHub token or app installation token */
	auth: string;
	/** Per-request timeout in milliseconds */
	requestTimeoutMs: number;
	/** Optional Pino-compatible log hooks for Octokit */
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
