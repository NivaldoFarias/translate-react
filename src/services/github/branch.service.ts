import { RestEndpointMethodTypes } from "@octokit/rest";
import { StatusCodes } from "http-status-codes";

import { BaseGitHubService, ContentService } from "@/services/github/";
import { env, logger, setupSignalHandlers } from "@/utils/";

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
	private readonly contentService = new ContentService();

	/** Set of branch names currently being tracked for cleanup */
	public activeBranches = new Set<string>();

	/**
	 * Creates a new branch service instance.
	 *
	 * Initializes the GitHub client and sets up cleanup handlers.
	 */
	constructor() {
		super();

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
			const response = await this.octokit.repos.get(this.repositories.fork);

			this.logger.debug({ branch: response.data.default_branch }, "Retrieved default branch");

			return response.data.default_branch;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "BranchService.getDefaultBranch",
				metadata: { fork: this.repositories.fork },
			});
		}
	}

	/**
	 * Type guard to check if an error is a GitHub API 404 Not Found error.
	 *
	 * @param error The error to check
	 *
	 * @returns True if the error is a 404 Not Found error
	 */
	private isNotFoundError(error: unknown): boolean {
		return (
			typeof error === "object" &&
			error !== null &&
			"status" in error &&
			error.status === StatusCodes.NOT_FOUND
		);
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
			const actualBaseBranch = baseBranch ?? (await this.getDefaultBranch());

			const mainBranchRef = await this.octokit.git.getRef({
				...this.repositories.fork,
				ref: `heads/${actualBaseBranch}`,
			});

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
			throw this.helpers.github.mapError(error, {
				operation: "BranchService.createBranch",
				metadata: { branchName, baseBranch, fork: this.repositories.fork },
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
	): Promise<RestEndpointMethodTypes["git"]["getRef"]["response"] | null> {
		try {
			const response = await this.octokit.git.getRef({
				...this.repositories.fork,
				ref: `heads/${branchName}`,
			});

			this.logger.debug({ branchName, sha: response.data.object.sha }, "Branch retrieved");

			return response;
		} catch (error) {
			if (this.isNotFoundError(error)) {
				this.logger.debug({ branchName }, "Branch not found (404)");
				return null;
			}

			throw this.helpers.github.mapError(error, {
				operation: "BranchService.getBranch",
				metadata: { branchName, fork: this.repositories.fork },
			});
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
			const response = await this.octokit.git.deleteRef({
				...this.repositories.fork,
				ref: `heads/${branchName}`,
			});

			this.activeBranches.delete(branchName);

			this.logger.info({ branchName }, "Branch deleted successfully");

			return response;
		} catch (error) {
			this.activeBranches.delete(branchName);

			throw this.helpers.github.mapError(error, {
				operation: "BranchService.deleteBranch",
				metadata: { branchName, fork: this.repositories.fork },
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
				const pr = await this.contentService.findPullRequestByBranch(branch);

				if (!pr) {
					this.logger.info({ branch }, "Cleanup: Deleting branch without PR");

					await this.deleteBranch(branch);

					continue;
				}

				const prStatus = await this.contentService.checkPullRequestStatus(pr.number);

				if (prStatus.needsUpdate) {
					this.logger.info(
						{ branch, prNumber: pr.number, mergeableState: prStatus.mergeableState },
						"Cleanup: Deleting branch with conflicted PR",
					);

					await this.deleteBranch(branch);
				} else {
					this.logger.info(
						{ branch, prNumber: pr.number, mergeableState: prStatus.mergeableState },
						"Cleanup: Preserving branch with valid PR",
					);
				}
			} catch (error) {
				this.logger.error({ branch, error }, "Cleanup: Error checking branch, skipping deletion");
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
			const forkRef = await this.getBranch(branchName);

			if (!forkRef) {
				this.logger.debug({ branchName }, "Branch not found, no commits exist");
				return false;
			}

			const listCommitsResponse = await this.octokit.repos.listCommits({
				...this.repositories.fork,
				sha: forkRef.data.object.sha,
			});

			const hasCommits = listCommitsResponse.data.some(
				(commit) => commit.author?.login === env.REPO_FORK_OWNER,
			);

			this.logger.debug(
				{ branchName, hasCommits, commitCount: listCommitsResponse.data.length },
				"Checked for fork commits",
			);

			return hasCommits;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "BranchService.checkIfCommitExistsOnFork",
				metadata: { branchName, fork: this.repositories.fork, expectedAuthor: env.REPO_FORK_OWNER },
			});
		}
	}
}
