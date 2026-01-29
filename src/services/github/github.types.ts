import type { components } from "@octokit/openapi-types";
import type { Octokit } from "@octokit/rest";

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

export interface SharedGitHubDependencies {
	octokit: Octokit;
	repositories: BaseRepositories;
}
