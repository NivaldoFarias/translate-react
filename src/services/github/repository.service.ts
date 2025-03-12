import type { RestEndpointMethodTypes } from "@octokit/rest";

import { extractErrorMessage } from "@/errors/error.handler";
import { BaseGitHubService } from "@/services/github/base.service";

/**
 * Service responsible for repository operations and fork management.
 * Handles repository content, fork synchronization, and tree management.
 *
 * ## Responsibilities
 * - Repository tree management
 * - Fork synchronization
 * - Token permission verification
 * - Repository content filtering
 */
export class RepositoryService extends BaseGitHubService {
	/**
	 * Retrieves the repository file tree.
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
	public async getRepositoryTree(baseBranch = "main", filterIgnored = true) {
		const response = await this.octokit.git.getTree({
			...this.fork,
			tree_sha: baseBranch,
			recursive: "true",
		});

		return filterIgnored ? this.filterRepositoryTree(response.data.tree) : response.data.tree;
	}

	/**
	 * Verifies that the GitHub token has required permissions.
	 * Checks access to both upstream and fork repositories.
	 *
	 * @example
	 * ```typescript
	 * const hasPermissions = await repoService.verifyTokenPermissions();
	 * if (!hasPermissions) console.error('Invalid token permissions');
	 * ```
	 */
	public async verifyTokenPermissions() {
		try {
			const response = await this.octokit.rest.users.getAuthenticated();

			if (response.status !== 200) {
				console.error(`Failed to verify token permissions: ${extractErrorMessage(response)}`);
				return false;
			}

			await this.octokit.rest.repos.get(this.upstream);
			return true;
		} catch (error) {
			console.error(`Token permission verification failed: ${extractErrorMessage(error)}`);
			return false;
		}
	}

	/**
	 * Checks if the fork is synchronized with upstream.
	 * Compares latest commit SHAs of both repositories.
	 *
	 * @example
	 * ```typescript
	 * const isSynced = await repoService.isForkSynced();
	 * if (!isSynced) await repoService.syncFork();
	 * ```
	 */
	public async isForkSynced() {
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
		} catch (error) {
			console.error(`Failed to check fork sync status: ${extractErrorMessage(error)}`);
			return false;
		}
	}

	/**
	 * Synchronizes the fork with the upstream repository.
	 * Creates a merge commit to update the fork.
	 *
	 * @example
	 * ```typescript
	 * const synced = await repoService.syncFork();
	 * if (!synced) console.error('Failed to sync fork');
	 * ```
	 */
	public async syncFork() {
		try {
			const mergeResponse = await this.octokit.repos.mergeUpstream({
				...this.fork,
				branch: "main",
			});

			return mergeResponse.status === 200;
		} catch (error) {
			console.error(`Failed to sync fork: ${extractErrorMessage(error)}`);
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
	) {
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
	public async fetchGlossary() {
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
		} catch (error) {
			console.error(`Failed to fetch glossary: ${extractErrorMessage(error)}`);
			return null;
		}
	}
}
