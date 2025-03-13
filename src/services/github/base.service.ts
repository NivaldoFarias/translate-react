import { Octokit } from "@octokit/rest";

/**
 * Base service for GitHub operations.
 * Provides common functionality and configuration for all GitHub services.
 *
 * ## Responsibilities
 * - GitHub client initialization
 * - Repository configuration management
 * - Common error handling
 */
export abstract class BaseGitHubService {
	/** GitHub API client instance */
	protected readonly octokit: Octokit;

	/**
	 * Creates a new base GitHub service instance
	 *
	 * @param upstream Original repository details
	 * @param fork Forked repository details
	 * @param githubToken GitHub personal access token
	 */
	constructor(
		protected readonly upstream: { owner: string; repo: string },
		protected readonly fork: { owner: string; repo: string },
		protected readonly githubToken = import.meta.env.GITHUB_TOKEN,
	) {
		this.octokit = new Octokit({
			auth: this.githubToken,
			log: {
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
			},
		});
	}
}
