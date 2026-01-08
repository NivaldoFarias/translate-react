import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { BaseGitHubServiceDependencies } from "./base.service";

import { mapGithubError } from "@/errors/";
import { logger } from "@/utils/";

import { BaseGitHubService } from "./base.service";

export type RepositoryServiceDependencies = BaseGitHubServiceDependencies;

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

	public constructor(dependencies: RepositoryServiceDependencies) {
		super(dependencies);
	}

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
			throw mapGithubError(error, `${RepositoryService.name}.getDefaultBranch`, {
				target,
				repoConfig: target === "fork" ? this.repositories.fork : this.repositories.upstream,
			});
		}
	}

	/**
	 * Retrieves the repository file tree from fork or upstream.
	 *
	 * For translation workflows, use `target: "upstream"` to get all candidate files
	 * from the source repository. Translation status determination is handled by the
	 * file discovery pipeline, not by SHA comparison.
	 *
	 * @param target Which repository to fetch tree from ('fork' or 'upstream')
	 * @param baseBranch Branch to get tree from (defaults to target's default branch)
	 * @param filterIgnored Whether to filter ignored paths
	 *
	 * @returns Array of repository tree items
	 *
	 * @example
	 * ```typescript
	 * // Get fork tree (default)
	 * const forkTree = await repoService.getRepositoryTree();
	 *
	 * // Get upstream tree for translation processing
	 * const candidates = await repoService.getRepositoryTree('upstream');
	 * ```
	 */
	public async getRepositoryTree(
		target: "fork" | "upstream" = "fork",
		baseBranch?: string,
		filterIgnored = true,
	): Promise<RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"]> {
		try {
			const repoConfig = target === "fork" ? this.repositories.fork : this.repositories.upstream;
			const branchName = baseBranch ?? (await this.getDefaultBranch(target));

			const response = await this.octokit.git.getTree({
				...repoConfig,
				tree_sha: branchName,
				recursive: "true",
			});

			const tree =
				filterIgnored ? this.filterRepositoryTree(response.data.tree) : response.data.tree;

			this.logger.info(
				{
					target,
					branch: branchName,
					totalItems: response.data.tree.length,
					filteredItems: tree.length,
					filterIgnored,
				},
				"Retrieved repository tree",
			);

			return tree;
		} catch (error) {
			throw mapGithubError(error, `${RepositoryService.name}.getRepositoryTree`, {
				target,
				baseBranch,
				filterIgnored,
				repoConfig: target === "fork" ? this.repositories.fork : this.repositories.upstream,
			});
		}
	}

	/**
	 * Verifies that the GitHub token has required permissions.
	 *
	 * Tests installation token access to both fork and upstream repositories
	 * to ensure the workflow can read from and write to the necessary resources.
	 *
	 * @returns `true` if token has access to both repositories, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * const hasPermissions = await repoService.verifyTokenPermissions();
	 * if (!hasPermissions) console.error('Invalid token permissions');
	 * ```
	 */
	public async verifyTokenPermissions(): Promise<boolean> {
		try {
			const results = await Promise.allSettled([
				this.octokit.rest.repos.get(this.repositories.fork),
				this.octokit.rest.repos.get(this.repositories.upstream),
			]);

			for (const [index, result] of results.entries()) {
				const repoType = index === 0 ? "fork" : "upstream";

				if (result.status === "rejected") {
					this.logger.error(
						{ reason: result.reason },
						`Insufficient permissions for ${repoType} repository`,
					);

					throw mapGithubError(result.reason, `${RepositoryService.name}.verifyTokenPermissions`, {
						repo: repoType === "fork" ? this.repositories.fork : this.repositories.upstream,
						reason: result.reason as unknown,
					});
				}

				this.logger.debug(
					{ response: result.value },
					`Sufficient permissions for ${repoType} repository`,
				);
			}

			this.logger.info(
				{
					fork: `${this.repositories.fork.owner}/${this.repositories.fork.repo}`,
					upstream: `${this.repositories.upstream.owner}/${this.repositories.upstream.repo}`,
				},
				"Token permissions verified successfully",
			);

			return true;
		} catch (error) {
			this.logger.error({ error }, "Token permission verification failed");

			return false;
		}
	}

	/**
	 * Checks if the fork repository exists.
	 *
	 * If it does not exist, an error is thrown.
	 */
	public async forkExists(): Promise<void> {
		try {
			const response = await this.octokit.repos.get(this.repositories.fork);

			this.logger.info(
				{ fork: this.repositories.fork, exists: !!response.data },
				"Fork repository existence checked",
			);
		} catch (error) {
			throw mapGithubError(error, `${RepositoryService.name}.forkExists`, {
				fork: this.repositories.fork,
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

			if (!upstreamCommits.data.length || !forkedCommits.data.length) {
				this.logger.warn(
					{
						upstreamCommits: upstreamCommits.data.length,
						forkedCommits: forkedCommits.data.length,
					},
					"At least one of the repositories has no commits",
				);

				return false;
			}

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
			this.logger.error({ error }, "Failed to check fork synchronization");

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
			this.logger.error({ error, fork: this.repositories.fork }, "Failed to synchronize fork");
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
			this.logger.debug({ error }, "Glossary file not found or inaccessible");
			return null;
		}
	}
}
