import { Octokit } from "@octokit/rest";

import type { components } from "@octokit/openapi-types";

import { GithubErrorHelper, LLMErrorHelper } from "@/errors/";
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

/**
 * Base service for GitHub operations.
 * Provides common functionality and configuration for all GitHub services.
 *
 * ### Responsibilities
 *
 * - GitHub client initialization
 * - Repository configuration management
 * - Common error handling
 */
export abstract class BaseGitHubService {
	/** GitHub API client instance */
	protected readonly octokit: Octokit;

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
	 * Creates a new base GitHub service instance.
	 *
	 * Initializes Octokit client with authentication and logging integration.
	 * Octokit operations are logged through a child logger that respects the
	 * application's `LOG_LEVEL` configuration for consistent observability.
	 */
	constructor() {
		const octokitLogger = logger.child({ component: "octokit" });

		this.octokit = new Octokit({
			auth: env.GITHUB_TOKEN,
			log: {
				debug: (message: string) => octokitLogger.debug(message),
				info: (message: string) => octokitLogger.info(message),
				warn: (message: string) => octokitLogger.warn(message),
				error: (message: string) => octokitLogger.error(message),
			},
		});
	}
}
