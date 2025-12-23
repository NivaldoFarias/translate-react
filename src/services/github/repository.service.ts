import type { RestEndpointMethodTypes } from "@octokit/rest";

import { mapGithubError } from "@/errors/";
import { BaseGitHubService } from "@/services/github/base.service";
import { logger } from "@/utils/";

/**
 * Service responsible for repository operations and fork management.
 *
 * ### Responsibilities
 *
 * - Repository tree management
 * - Fork synchronization
 * - Token permission verification
 * - Repository content filtering
 */
export class RepositoryService extends BaseGitHubService {
	private readonly logger = logger.child({ component: RepositoryService.name });

	/**
	 * Gets the default branch name for a repository.
	 *
	 * @param target Which repository to check ('fork' or 'upstream')
	 *
	 * @returns The default branch name
	 *
	 * @example
	 * ```typescript
	 * const defaultBranch = await repoService.getDefaultBranch('fork');
	 * ```
	 */
	public async getDefaultBranch(target: "fork" | "upstream" = "fork"): Promise<string> {
		try {
			const repoConfig = target === "fork" ? this.repositories.fork : this.repositories.upstream;
			const response = await this.octokit.repos.get(repoConfig);

			this.logger.debug(
				{ target, branch: response.data.default_branch },
				"Retrieved default branch",
			);

			return response.data.default_branch;
		} catch (error) {
			throw mapGithubError(error, {
				operation: `${RepositoryService.name}.getDefaultBranch`,
				metadata: {
					target,
					repoConfig: target === "fork" ? this.repositories.fork : this.repositories.upstream,
				},
			});
		}
	}

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
		baseBranch?: string,
		filterIgnored = true,
	): Promise<RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"]> {
		try {
			const branchName = baseBranch ?? (await this.getDefaultBranch("fork"));
			const response = await this.octokit.git.getTree({
				...this.repositories.fork,
				tree_sha: branchName,
				recursive: "true",
			});

			const tree =
				filterIgnored ? this.filterRepositoryTree(response.data.tree) : response.data.tree;

			this.logger.info(
				{
					branch: branchName,
					totalItems: response.data.tree.length,
					filteredItems: tree.length,
					filterIgnored,
				},
				"Retrieved repository tree",
			);

			return tree;
		} catch (error) {
			throw mapGithubError(error, {
				operation: `${RepositoryService.name}.getRepositoryTree`,
				metadata: { baseBranch, filterIgnored, fork: this.repositories.fork },
			});
		}
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

			await this.octokit.rest.repos.get(this.repositories.upstream);

			this.logger.info({ user: response.data.login }, "Token permissions verified successfully");
			return true;
		} catch (error) {
			this.logger.error({ err: error }, "Token permission verification failed");
			return false;
		}
	}

	/**
	 * Checks if the fork repository exists. If it does not exist, an error is thrown.
	 */
	public async forkExists(): Promise<void> {
		try {
			const response = await this.octokit.repos.get(this.repositories.fork);

			this.logger.info(
				{ fork: this.repositories.fork, exists: !!response.data },
				"Fork repository existence checked",
			);
		} catch (error) {
			throw mapGithubError(error, {
				operation: `${RepositoryService.name}.forkExists`,
				metadata: { fork: this.repositories.fork },
			});
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
				this.octokit.repos.get(this.repositories.upstream),
				this.octokit.repos.get(this.repositories.fork),
			]);

			const [upstreamCommits, forkedCommits] = await Promise.all([
				this.octokit.repos.listCommits({
					...this.repositories.upstream,
					per_page: 1,
					sha: upstreamRepo.data.default_branch,
				}),
				this.octokit.repos.listCommits({
					...this.repositories.fork,
					per_page: 1,
					sha: forkedRepo.data.default_branch,
				}),
			]);

			const isSynced = upstreamCommits.data[0]?.sha === forkedCommits.data[0]?.sha;

			this.logger.debug(
				{
					isSynced,
					upstreamSha: upstreamCommits.data[0]?.sha,
					forkSha: forkedCommits.data[0]?.sha,
				},
				"Checked fork synchronization status",
			);

			return isSynced;
		} catch (error) {
			this.logger.error({ err: error }, "Failed to check fork synchronization");
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
				...this.repositories.fork,
				branch: "main",
			});

			this.logger.info(
				{
					fork: this.repositories.fork,
					message: mergeResponse.data.message,
					mergeType: mergeResponse.data.merge_type,
				},
				"Fork synchronized successfully",
			);

			return true;
		} catch (error) {
			this.logger.error({ err: error, fork: this.repositories.fork }, "Failed to synchronize fork");
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
				...this.repositories.upstream,
				path: "GLOSSARY.md",
			});

			if ("content" in response.data) {
				const content = Buffer.from(response.data.content, "base64").toString();
				this.logger.info({ contentLength: content.length }, "Glossary fetched successfully");
				return content;
			}

			this.logger.warn("Glossary file exists but has no content");
			return null;
		} catch (error) {
			this.logger.debug({ err: error }, "Glossary file not found or inaccessible");
			return null;
		}
	}
}
