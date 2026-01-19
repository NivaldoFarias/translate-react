import { Octokit } from "@octokit/rest";

import type { components } from "@octokit/openapi-types";

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

export interface BaseGitHubServiceDependencies {
	octokit: Octokit;
	repositories: BaseRepositories;
}

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
 */
export abstract class BaseGitHubService {
	/** GitHub API client instance */
	protected readonly octokit: Octokit;

	/** Repository metadata for upstream and fork repositories */
	protected readonly repositories: BaseRepositories;

	/**
	 * Creates an instance of {@link BaseGitHubService}
	 *
	 * @param dependencies Dependencies for the service
	 */
	constructor(dependencies: BaseGitHubServiceDependencies) {
		this.octokit = dependencies.octokit;
		this.repositories = dependencies.repositories;
	}
}
