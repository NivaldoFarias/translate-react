import { Buffer } from "node:buffer";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { SharedGitHubDependencies } from "./github.types";

import { env, filterMarkdownFiles, logger, TRANSLATION_GUIDELINES_CANDIDATES } from "@/utils/";

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

		this.logger.debug({ target, branch: branchName, filterIgnored }, "Fetching repository tree");

		const response = await this.deps.octokit.git.getTree({
			...repoConfig,
			tree_sha: branchName,
			recursive: "true",
		});

		const result = filterIgnored ? filterMarkdownFiles(response.data.tree) : response.data.tree;

		this.logger.debug(
			{
				target,
				branch: branchName,
				totalItems: response.data.tree.length,
				filteredItems: result.length,
			},
			"Repository tree fetched",
		);

		return result;
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
		this.logger.debug("Checking if fork is synced with upstream");

		try {
			const [upstreamRepo, forkedRepo] = await Promise.all([
				this.deps.octokit.repos.get(this.deps.repositories.upstream),
				this.deps.octokit.repos.get(this.deps.repositories.fork),
			]);

			this.logger.debug(
				{
					upstreamBranch: upstreamRepo.data.default_branch,
					forkBranch: forkedRepo.data.default_branch,
				},
				"Fetching latest commits from both repositories",
			);

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

			const upstreamSha = upstreamCommits.data[0]?.sha;
			const forkSha = forkedCommits.data[0]?.sha;
			const isSynced = upstreamSha === forkSha;

			this.logger.debug(
				{ upstreamSha, forkSha, isSynced },
				isSynced ? "Fork is in sync with upstream" : "Fork is behind upstream",
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
	 * const synced = await repository.syncFork();
	 * if (!synced) console.error('Failed to sync fork');
	 * ```
	 */
	public async syncFork(): Promise<boolean> {
		this.logger.debug(
			{ fork: this.deps.repositories.fork },
			"Starting fork synchronization with upstream",
		);

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
	 * Fetches the translation guidelines file from the upstream repository.
	 *
	 * The translation guidelines file contains standardized terminology
	 * and translations for the project. It is essential for maintaining consistent
	 * translations across documentation.
	 *
	 * ### Discovery Strategy
	 *
	 * 1. If `TRANSLATION_GUIDELINES_FILE` env var is set, fetches that specific file
	 * 2. Otherwise, tries common filenames in order: `GLOSSARY.md`, `TRANSLATION.md`, etc.
	 * 3. Returns `null` if no guidelines file is found
	 *
	 * @returns The content of the translation guidelines file as a string,
	 * or `null` if the file doesn't exist or cannot be retrieved
	 *
	 * @see {@link TRANSLATION_GUIDELINES_CANDIDATES} for the list of auto-discovered filenames
	 *
	 * @example
	 * ```typescript
	 * const guidelines = await repository.fetchTranslationGuidelinesFile();
	 * if (guidelines) {
	 *   translator.translationGuidelines = guidelines;
	 * } else {
	 *   logger.warn('No translation guidelines found - proceeding without');
	 * }
	 * ```
	 */
	public async fetchTranslationGuidelinesFile(): Promise<string | null> {
		if (env.TRANSLATION_GUIDELINES_FILE) {
			this.logger.debug(
				{ filename: env.TRANSLATION_GUIDELINES_FILE },
				"Using explicit translation guidelines filename from env",
			);
			return this.tryFetchGuidelinesFile(env.TRANSLATION_GUIDELINES_FILE);
		}

		this.logger.debug(
			{ candidates: TRANSLATION_GUIDELINES_CANDIDATES },
			"Auto-discovering translation guidelines file",
		);

		for (const candidate of TRANSLATION_GUIDELINES_CANDIDATES) {
			const content = await this.tryFetchGuidelinesFile(candidate);
			if (content) {
				this.logger.debug(
					{ filename: candidate, contentLength: content.length },
					"Translation guidelines file found in auto-discovered location",
				);
				return content;
			}
		}

		this.logger.debug("No translation guidelines file found in any candidate location");
		return null;
	}

	/**
	 * Attempts to fetch a specific guidelines file from the upstream repository.
	 *
	 * @param filename The filename to fetch from the repository root
	 *
	 * @returns The file content as a string, or `null` if not found or empty
	 */
	private async tryFetchGuidelinesFile(filename: string): Promise<string | null> {
		try {
			const response = await this.deps.octokit.repos.getContent({
				...this.deps.repositories.upstream,
				path: filename,
			});

			if ("content" in response.data) {
				const content = Buffer.from(response.data.content, "base64").toString();
				this.logger.info(
					{ filename, contentLength: content.length },
					"Translation guidelines fetched successfully",
				);
				return content;
			}

			this.logger.warn({ filename }, "Translation guidelines file exists but has no content");
			return null;
		} catch {
			this.logger.debug({ filename }, "Translation guidelines file not found");
			return null;
		}
	}
}
