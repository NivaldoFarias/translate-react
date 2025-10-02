import type { RestEndpointMethodTypes } from "@octokit/rest";

import { BaseGitHubService } from "@/services/github/base.service";

/**
 * Service responsible for repository operations and fork management.
 *
 * ### Responsibilities
 * - Repository tree management
 * - Fork synchronization
 * - Token permission verification
 * - Repository content filtering
 */
export class RepositoryService extends BaseGitHubService {
	/**
	 * Retrieves the repository file tree.
	 *
	 * Can optionally filter out ignored paths.
	 *
	 * @param baseBranch Branch to get tree from
	 * @param filterIgnored Whether to filter ignored paths
	 *
	 * @example
	 * ```typescript
	 * const tree = await repoService.getRepositoryTree('main', true);
	 * ```
	 */
	public async getRepositoryTree(
		baseBranch = "main",
		filterIgnored = true,
	): Promise<RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"]> {
		const response = await this.octokit.git.getTree({
			...this.fork,
			tree_sha: baseBranch,
			recursive: "true",
		});

		return filterIgnored ? this.filterRepositoryTree(response.data.tree) : response.data.tree;
	}

	/**
	 * Verifies that the GitHub token has required permissions.
	 *
	 * @example
	 * ```typescript
	 * const hasPermissions = await repoService.verifyTokenPermissions();
	 * if (!hasPermissions) console.error('Invalid token permissions');
	 * ```
	 */
	public async verifyTokenPermissions(): Promise<boolean> {
		try {
			const response = await this.octokit.rest.users.getAuthenticated();

			if (response.status !== 200) {
				return false;
			}

			await this.octokit.rest.repos.get(this.upstream);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Checks if the fork is synchronized with upstream.
	 *
	 * @example
	 * ```typescript
	 * const isSynced = await repoService.isForkSynced();
	 * if (!isSynced) await repoService.syncFork();
	 * ```
	 */
	public async isForkSynced(): Promise<boolean> {
		try {
			const [upstreamRepo, forkedRepo] = await Promise.all([
				this.octokit.repos.get(this.upstream),
				this.octokit.repos.get(this.fork),
			]);

			const [upstreamCommits, forkedCommits] = await Promise.all([
				this.octokit.repos.listCommits({
					...this.upstream,
					per_page: 1,
					sha: upstreamRepo.data.default_branch,
				}),
				this.octokit.repos.listCommits({
					...this.fork,
					per_page: 1,
					sha: forkedRepo.data.default_branch,
				}),
			]);

			return upstreamCommits.data[0]?.sha === forkedCommits.data[0]?.sha;
		} catch {
			return false;
		}
	}

	/**
	 * Synchronizes the fork with the upstream repository.
	 *
	 * Creates a merge commit to update the fork.
	 *
	 * @example
	 * ```typescript
	 * const synced = await repoService.syncFork();
	 * if (!synced) console.error('Failed to sync fork');
	 * ```
	 */
	public async syncFork(): Promise<boolean> {
		try {
			const mergeResponse = await this.octokit.repos.mergeUpstream({
				...this.fork,
				branch: "main",
			});

			return mergeResponse.status === 200;
		} catch {
			return false;
		}
	}

	/**
	 * Filters repository tree for valid markdown files.
	 *
	 * @param tree Repository tree from GitHub API
	 */
	protected filterRepositoryTree(
		tree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
	): RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"] {
		return tree.filter((item) => {
			if (!item.path) return false;
			else if (!item.path.endsWith(".md")) return false;
			else if (!item.path.includes("/")) return false;
			else if (!item.path.includes("src/")) return false;
			else return true;
		});
	}

	/**
	 * Fetches the glossary.md file from the repository.
	 *
	 * This method retrieves the content of the glossary file which contains
	 * standardized terminology and translations for the project. The glossary
	 * is essential for maintaining consistent translations across documentation.
	 *
	 * @returns The content of the glossary file as a string, or null if the file doesn't exist or cannot be retrieved
	 *
	 * @example
	 * ```typescript
	 * const glossary = await repositoryService.fetchGlossary();
	 * if (glossary) {
	 *   // Process glossary content
	 * } else {
	 *   console.error('Failed to fetch glossary');
	 * }
	 * ```
	 */
	public async fetchGlossary(): Promise<string | null> {
		try {
			const response = await this.octokit.repos.getContent({
				...this.upstream,
				path: "GLOSSARY.md",
			});

			if ("content" in response.data) {
				const content = Buffer.from(response.data.content, "base64").toString();
				return content;
			}

			return null;
		} catch {
			return null;
		}
	}
}
