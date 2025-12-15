import { Octokit } from "@octokit/rest";

import type { components } from "@octokit/openapi-types";

import { GithubErrorHelper, LLMErrorHelper } from "@/errors/";
import { githubRateLimiter } from "@/services/rate-limiter/";
import { env, logger } from "@/utils/";

/** GitHub repository metadata for fork and upstream repositories */
export interface RepositoryMetadata {
	owner: components["parameters"]["owner"];
	repo: components["parameters"]["repo"];
	[key: string]: unknown;
}

export interface BaseRepositories {
	upstream: RepositoryMetadata;
	fork: RepositoryMetadata;
}

const octokitLogger = logger.child({ component: "octokit" });

/**
 * Base service for GitHub operations.
 *
 * Provides common functionality and configuration for all GitHub services,
 * including rate limiting for API requests.
 *
 * ### Responsibilities
 *
 * - GitHub client initialization
 * - Repository configuration management
 * - Rate limiting for API requests
 * - Common error handling
 */
export abstract class BaseGitHubService {
	/** GitHub API client instance */
	protected readonly octokit = new Octokit({
		auth: env.GITHUB_TOKEN,
		request: {
			timeout: env.GITHUB_REQUEST_TIMEOUT,
		},
		log: {
			debug: (message: string) => {
				octokitLogger.debug(message);
			},
			info: (message: string) => {
				octokitLogger.info(message);
			},
			warn: (message: string) => {
				octokitLogger.warn(message);
			},
			error: (message: string) => {
				octokitLogger.error(message);
			},
		},
	});

	protected readonly helpers = {
		llm: new LLMErrorHelper(),
		github: new GithubErrorHelper(),
	};

	/** Repository metadata for upstream and fork repositories */
	protected readonly repositories: BaseRepositories = {
		upstream: {
			owner: env.REPO_UPSTREAM_OWNER,
			repo: env.REPO_UPSTREAM_NAME,
		},
		fork: {
			owner: env.REPO_FORK_OWNER,
			repo: env.REPO_FORK_NAME,
		},
	};

	/**
	 * Executes a GitHub API request with rate limiting.
	 *
	 * Wraps any Octokit API call with automatic rate limiting to prevent
	 * hitting GitHub's API limits (5000 requests/hour for authenticated users).
	 *
	 * @param fn Function that performs the GitHub API request
	 * @param priority Optional priority for the request (higher = executed sooner)
	 *
	 * @returns Promise resolving to the API response
	 *
	 * @example
	 * ```typescript
	 * const repos = await this.withRateLimit(
	 *   () => this.octokit.repos.listForOrg({ org: 'facebook' })
	 * );
	 * ```
	 */
	protected async withRateLimit<T>(fn: () => Promise<T>, priority?: number): Promise<T> {
		return githubRateLimiter.schedule(fn, priority);
	}
}
