import { Buffer } from "node:buffer";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { SharedGitHubDependencies } from "./github.types";

import { logger } from "@/utils/";

/**
 * Repository operations module for GitHub API.
 *
 * Handles repository tree management, fork synchronization, and token verification.
 */
export class GitHubRepository {
	private readonly logger = logger.child({ component: GitHubRepository.name });

	constructor(private readonly deps: SharedGitHubDependencies) {}

	/**
	 * Gets the default branch name for a repository.
	 *
	 * @param target Which repository to check ('fork' or 'upstream')
	 *
	 * @returns The default branch name
	 *
	 * @example
	 * ```typescript
	 * const defaultBranch = await repository.getDefaultBranch('fork');
	 * ```
	 */
	public async getDefaultBranch(target: "fork" | "upstream" = "fork"): Promise<string> {
		const repoConfig =
			target === "fork" ? this.deps.repositories.fork : this.deps.repositories.upstream;
		const response = await this.deps.octokit.repos.get(repoConfig);

		return response.data.default_branch;
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
	 * const forkTree = await repository.getRepositoryTree();
	 *
	 * // Get upstream tree for translation processing
	 * const candidates = await repository.getRepositoryTree('upstream');
	 * ```
	 */
	public async getRepositoryTree(
		target: "fork" | "upstream" = "fork",
		baseBranch?: string,
		filterIgnored = true,
	): Promise<RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"]> {
		const repoConfig =
			target === "fork" ? this.deps.repositories.fork : this.deps.repositories.upstream;
		const branchName = baseBranch ?? (await this.getDefaultBranch(target));

		const response = await this.deps.octokit.git.getTree({
			...repoConfig,
			tree_sha: branchName,
			recursive: "true",
		});

		return filterIgnored ? this.filterRepositoryTree(response.data.tree) : response.data.tree;
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
	 * const hasPermissions = await repository.verifyTokenPermissions();
	 * if (!hasPermissions) console.error('Invalid token permissions');
	 * ```
	 */
	public async verifyTokenPermissions(): Promise<boolean> {
		const results = await Promise.allSettled([
			this.deps.octokit.rest.repos.get(this.deps.repositories.fork),
			this.deps.octokit.rest.repos.get(this.deps.repositories.upstream),
		]);

		for (const [index, result] of results.entries()) {
			const repoType = index === 0 ? "fork" : "upstream";

			if (result.status === "rejected") {
				this.logger.error(
					{ reason: result.reason },
					`Insufficient permissions for ${repoType} repository`,
				);

				return false;
			}
		}

		this.logger.info(
			{
				fork: `${this.deps.repositories.fork.owner}/${this.deps.repositories.fork.repo}`,
				upstream: `${this.deps.repositories.upstream.owner}/${this.deps.repositories.upstream.repo}`,
			},
			"Token permissions verified successfully",
		);

		return true;
	}

	/**
	 * Checks if a branch is behind its base branch.
	 *
	 * Compares the commit history of two branches to determine if the head branch
	 * is missing commits from the base branch. Returns true if base has commits
	 * that head doesn't have.
	 *
	 * @param headBranch Branch to check (e.g., 'translate/some-file')
	 * @param baseBranch Base branch to compare against (e.g., 'main')
	 * @param target Which repository to check ('fork' or 'upstream')
	 *
	 * @returns `true` if head is behind base, `false` if up-to-date or ahead
	 *
	 * @example
	 * ```typescript
	 * const isBehind = await repository.isBranchBehind(
	 *   'translate/docs/intro.md',
	 *   'main'
	 * );
	 * if (isBehind) {
	 *   // Recreate branch with latest base
	 * }
	 * ```
	 */
	public async isBranchBehind(
		headBranch: string,
		baseBranch: string,
		target: "fork" | "upstream" = "fork",
	): Promise<boolean> {
		try {
			const repoConfig =
				target === "fork" ? this.deps.repositories.fork : this.deps.repositories.upstream;

			const comparison = await this.deps.octokit.repos.compareCommits({
				...repoConfig,
				base: headBranch,
				head: baseBranch,
			});

			return comparison.data.ahead_by > 0;
		} catch (error) {
			this.logger.warn(
				{ error, headBranch, baseBranch, target },
				"Failed to compare branches, assuming not behind",
			);
			return false;
		}
	}

	/**
	 * Checks if the fork repository exists.
	 *
	 * If it does not exist, an error is thrown.
	 */
	public async forkExists(): Promise<void> {
		await this.deps.octokit.repos.get(this.deps.repositories.fork);
	}

	/**
	 * Checks if the fork is synchronized with upstream.
	 *
	 * @example
	 * ```typescript
	 * const isSynced = await repository.isForkSynced();
	 * if (!isSynced) await repository.syncFork();
	 * ```
	 */
	public async isForkSynced(): Promise<boolean> {
		try {
			const [upstreamRepo, forkedRepo] = await Promise.all([
				this.deps.octokit.repos.get(this.deps.repositories.upstream),
				this.deps.octokit.repos.get(this.deps.repositories.fork),
			]);

			const [upstreamCommits, forkedCommits] = await Promise.all([
				this.deps.octokit.repos.listCommits({
					...this.deps.repositories.upstream,
					per_page: 1,
					sha: upstreamRepo.data.default_branch,
				}),
				this.deps.octokit.repos.listCommits({
					...this.deps.repositories.fork,
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

			return upstreamCommits.data[0]?.sha === forkedCommits.data[0]?.sha;
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
	 * const synced = await repository.syncFork();
	 * if (!synced) console.error('Failed to sync fork');
	 * ```
	 */
	public async syncFork(): Promise<boolean> {
		try {
			const mergeResponse = await this.deps.octokit.repos.mergeUpstream({
				...this.deps.repositories.fork,
				branch: "main",
			});

			this.logger.info(
				{
					fork: this.deps.repositories.fork,
					message: mergeResponse.data.message,
					mergeType: mergeResponse.data.merge_type,
				},
				"Fork synchronized successfully",
			);

			return true;
		} catch (error) {
			this.logger.error({ error, fork: this.deps.repositories.fork }, "Failed to synchronize fork");
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
	 * const glossary = await repository.fetchGlossary();
	 * if (glossary) {
	 *   // Process glossary content
	 * } else {
	 *   console.error('Failed to fetch glossary');
	 * }
	 * ```
	 */
	public async fetchGlossary(): Promise<string | null> {
		try {
			const response = await this.deps.octokit.repos.getContent({
				...this.deps.repositories.upstream,
				path: "GLOSSARY.md",
			});

			if ("content" in response.data) {
				const content = Buffer.from(response.data.content, "base64").toString();
				this.logger.info({ contentLength: content.length }, "Glossary fetched successfully");
				return content;
			}

			this.logger.warn("Glossary file exists but has no content");
			return null;
		} catch {
			return null;
		}
	}
}
