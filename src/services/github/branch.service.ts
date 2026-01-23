import { RestEndpointMethodTypes } from "@octokit/rest";

import type { BaseGitHubServiceDependencies } from "./base.service";

import { ApplicationError, ErrorCode, mapError } from "@/errors/";
import { env, logger, setupSignalHandlers } from "@/utils/";

import { BaseGitHubService } from "./base.service";
import { ContentService } from "./content.service";

export interface BranchServiceDependencies extends BaseGitHubServiceDependencies {
	contentService: ContentService;
}

/**
 * Service responsible for Git branch operations and lifecycle management.
 * Handles branch creation, deletion, and cleanup tasks.
 *
 * ### Responsibilities
 *
 * - Branch creation and deletion
 * - Branch state tracking
 * - Automatic cleanup on process termination
 * - Error handling and recovery
 */
export class BranchService extends BaseGitHubService {
	private readonly logger = logger.child({ component: BranchService.name });
	private readonly services: {
		content: ContentService;
	};

	/** Set of branch names currently being tracked for cleanup */
	public activeBranches = new Set<string>();

	/**
	 * Creates a new branch service instance.
	 *
	 * Initializes the GitHub client and sets up cleanup handlers.
	 */
	constructor(dependencies: BranchServiceDependencies) {
		super(dependencies);

		this.services = { content: dependencies.contentService };

		setupSignalHandlers(async () => {
			await this.cleanup();
		});
	}

	/**
	 * Gets the default branch name for the fork repository.
	 *
	 * @returns The default branch name
	 *
	 * @example
	 * ```typescript
	 * const defaultBranch = await branchService.getDefaultBranch();
	 * ```
	 */
	private async getDefaultBranch(): Promise<string> {
		try {
			this.logger.info(
				{ fork: this.repositories.fork },
				"Retrieving default branch for fork repository",
			);

			const response = await this.octokit.repos.get(this.repositories.fork);

			this.logger.debug({ branch: response.data.default_branch }, "Retrieved default branch");

			return response.data.default_branch;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${BranchService.name}.${this.getDefaultBranch.name}`, {
				fork: this.repositories.fork,
			});
		}
	}

	/**
	 * Creates a new Git branch from a base branch.
	 *
	 * Tracks the branch for cleanup if created successfully.
	 *
	 * @param branchName Name for the new branch
	 * @param baseBranch Branch to create from
	 *
	 * @example
	 * ```typescript
	 * const branch = await branchService.createBranch('feature/new-branch');
	 * ```
	 */
	public async createBranch(
		branchName: string,
		baseBranch?: string,
	): Promise<RestEndpointMethodTypes["git"]["createRef"]["response"]> {
		try {
			this.logger.info({ branchName, baseBranch }, "Creating new branch");

			const actualBaseBranch = baseBranch ?? (await this.getDefaultBranch());
			this.logger.debug({ actualBaseBranch }, "Using base branch for new branch creation");

			const mainBranchRef = await this.octokit.git.getRef({
				...this.repositories.fork,
				ref: `heads/${actualBaseBranch}`,
			});
			this.logger.debug(
				{ baseBranch: actualBaseBranch, sha: mainBranchRef.data.object.sha },
				"Retrieved base branch reference",
			);

			const branchRef = await this.octokit.git.createRef({
				...this.repositories.fork,
				ref: `refs/heads/${branchName}`,
				sha: mainBranchRef.data.object.sha,
			});

			this.activeBranches.add(branchName);

			this.logger.info(
				{ branchName, baseBranch: actualBaseBranch, sha: mainBranchRef.data.object.sha },
				"Branch created successfully",
			);

			return branchRef;
		} catch (error) {
			this.activeBranches.delete(branchName);

			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${BranchService.name}.${this.createBranch.name}`, {
				branchName,
				baseBranch,
				fork: this.repositories.fork,
			});
		}
	}

	/**
	 * Retrieves information about an existing branch.
	 *
	 * @param branchName Name of branch to retrieve
	 *
	 * @example
	 * ```typescript
	 * const branch = await branchService.getBranch('main');
	 * if (branch) console.log('Branch exists');
	 * ```
	 */
	public async getBranch(
		branchName: string,
	): Promise<RestEndpointMethodTypes["git"]["getRef"]["response"] | undefined> {
		try {
			this.logger.info({ branchName }, "Retrieving branch information");

			const response = await this.octokit.git.getRef({
				...this.repositories.fork,
				ref: `heads/${branchName}`,
			});

			this.logger.info({ branchName, sha: response.data.object.sha }, "Branch retrieved");

			return response;
		} catch (error) {
			const mappedError =
				error instanceof ApplicationError ? error : (
					mapError(error, `${BranchService.name}.${this.getBranch.name}`, {
						branchName,
						fork: this.repositories.fork,
					})
				);

			if (
				mappedError.code === ErrorCode.NotFound ||
				mappedError.code === ErrorCode.GithubNotFound
			) {
				this.logger.info({ branchName }, "Branch not found (404)");
				return;
			}

			throw mappedError;
		}
	}

	/**
	 * Deletes a Git branch and removes it from tracking.
	 * Always removes from tracking even if deletion fails.
	 *
	 * @param branchName Name of branch to delete
	 *
	 * @example
	 * ```typescript
	 * await branchService.deleteBranch('feature/old-branch');
	 * ```
	 */
	public async deleteBranch(
		branchName: string,
	): Promise<RestEndpointMethodTypes["git"]["deleteRef"]["response"]> {
		try {
			this.logger.info({ branchName }, "Deleting branch");

			const response = await this.octokit.git.deleteRef({
				...this.repositories.fork,
				ref: `heads/${branchName}`,
			});

			this.activeBranches.delete(branchName);

			this.logger.info({ branchName }, "Branch deleted successfully");

			return response;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${BranchService.name}.deleteBranch`, {
				branchName,
				fork: this.repositories.fork,
			});
		}
	}

	/**
	 * Removes all tracked branches, but only if they don't have valid PRs.
	 *
	 * Called automatically on process termination. Checks each branch for an associated
	 * pull request before deletion. If a PR exists without conflicts, the branch is
	 * preserved to avoid closing valid PRs. Only branches without PRs or branches with
	 * conflicted PRs are deleted during cleanup.
	 *
	 * ### Safety Checks
	 *
	 * For each branch in `activeBranches`:
	 * 1. Check if an open PR exists for the branch
	 * 2. If PR exists, check for merge conflicts
	 * 3. Only delete if: no PR exists OR PR has conflicts
	 * 4. Skip deletion if: PR exists without conflicts
	 *
	 * This prevents accidentally closing valid PRs when the process is interrupted
	 * via SIGINT (Ctrl+C) or other termination signals.
	 *
	 * @example
	 * ```typescript
	 * // On SIGINT:
	 * // - Branch "translate/file1.md" has PR #123 (clean) → preserved
	 * // - Branch "translate/file2.md" has PR #124 (conflicts) → deleted
	 * // - Branch "translate/file3.md" has no PR → deleted
	 * ```
	 */
	protected async cleanup(): Promise<void> {
		const branchesToCheck = Array.from(this.activeBranches);

		for (const branch of branchesToCheck) {
			try {
				const pr = await this.services.content.findPullRequestByBranch(branch);

				if (!pr) {
					this.logger.info({ branch }, "Cleanup: Deleting branch without PR");
					await this.deleteBranch(branch);
					continue;
				}

				const prStatus = await this.services.content.checkPullRequestStatus(pr.number);

				if (prStatus.needsUpdate) {
					this.logger.info(
						{ branch, prNumber: pr.number, mergeableState: prStatus.mergeableState },
						"Cleanup: Deleting branch with conflicted PR",
					);

					await this.deleteBranch(branch);
					continue;
				}

				this.logger.info(
					{ branch, prNumber: pr.number, mergeableState: prStatus.mergeableState },
					"Cleanup: Preserving branch with valid PR",
				);
			} catch (error) {
				const mappedError =
					error instanceof ApplicationError ? error : (
						mapError(error, `${BranchService.name}.${this.cleanup.name}`, { branch })
					);

				this.logger.error(
					{ branch, error: mappedError },
					"Cleanup: Error checking branch, skipping deletion",
				);
			}
		}
	}

	/**
	 * Verifies if commits exist on the fork from the current user.
	 *
	 * Used to determine if translation work has already been done.
	 *
	 * @param branchName Branch to check for commits
	 *
	 * @example
	 * ```typescript
	 * const hasCommits = await branchService.checkIfCommitExistsOnFork('feature/translation');
	 * if (hasCommits) console.log('Translation work already exists on fork');
	 * ```
	 */
	public async checkIfCommitExistsOnFork(branchName: string): Promise<boolean> {
		try {
			this.logger.info({ branchName }, "Checking for commits on fork by current user");

			const forkRef = await this.getBranch(branchName);

			if (!forkRef) {
				this.logger.info({ branchName }, "Branch not found, no commits exist");
				return false;
			}

			const listCommitsResponse = await this.octokit.repos.listCommits({
				...this.repositories.fork,
				sha: forkRef.data.object.sha,
			});
			this.logger.debug(
				{ branchName, commitCount: listCommitsResponse.data.length },
				"Retrieved commits from fork branch",
			);

			const hasCommits = listCommitsResponse.data.some(
				(commit) => commit.author?.login === env.REPO_FORK_OWNER,
			);

			this.logger.info(
				{ branchName, hasCommits, commitCount: listCommitsResponse.data.length },
				"Checked for fork commits",
			);

			return hasCommits;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${BranchService.name}.checkIfCommitExistsOnFork`, {
				branchName,
				fork: this.repositories.fork,
				expectedAuthor: env.REPO_FORK_OWNER,
			});
		}
	}
}
