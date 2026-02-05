import { RequestError } from "@octokit/request-error";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { PullRequestStatus } from "../runner";

import type { SharedGitHubDependencies } from "./github.types";

import { logger, registerCleanup } from "@/utils/";

/**
 * Branch operations module for GitHub API.
 *
 * Handles branch creation, deletion, and lifecycle management with cleanup support.
 */
export class GitHubBranch {
	private readonly logger = logger.child({ component: GitHubBranch.name });

	/** Set of branch names currently being tracked for cleanup */
	public activeBranches = new Set<string>();

	/**
	 * Callback for cleanup operations that need access to content methods.
	 * Set by the unified service to enable cleanup functionality.
	 */
	private cleanupContentAccess?: {
		findPullRequestByBranch: (branchName: string) => Promise<unknown>;
		checkPullRequestStatus: (prNumber: number) => Promise<{ needsUpdate: boolean }>;
	};

	constructor(private readonly deps: SharedGitHubDependencies) {
		registerCleanup(async () => {
			await this.cleanup();
		});
	}

	/**
	 * Sets the cleanup content access callback.
	 *
	 * Called by the unified service to enable cleanup functionality.
	 *
	 * @param access The callback for cleanup operations that need access to content methods
	 * @param access.findPullRequestByBranch The callback to find a pull request by branch name
	 * @param access.checkPullRequestStatus The callback to check the status of a pull request
	 */
	public setCleanupContentAccess(access: {
		findPullRequestByBranch: (branchName: string) => Promise<unknown>;
		checkPullRequestStatus: (prNumber: number) => Promise<PullRequestStatus>;
	}): void {
		this.cleanupContentAccess = access;
	}

	/**
	 * Gets the default branch name for the fork repository.
	 *
	 * @returns The default branch name
	 */
	private async getDefaultBranch(): Promise<string> {
		const response = await this.deps.octokit.repos.get(this.deps.repositories.fork);

		return response.data.default_branch;
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
	 * const branch = await branch.createBranch('feature/new-branch');
	 * ```
	 */
	public async createBranch(
		branchName: string,
		baseBranch?: string,
	): Promise<RestEndpointMethodTypes["git"]["createRef"]["response"]> {
		this.logger.debug({ branchName, baseBranch: baseBranch ?? "(default)" }, "Creating new branch");

		try {
			const actualBaseBranch = baseBranch ?? (await this.getDefaultBranch());

			this.logger.debug({ branchName, actualBaseBranch }, "Resolved base branch, fetching ref");

			const mainBranchRef = await this.deps.octokit.git.getRef({
				...this.deps.repositories.fork,
				ref: `heads/${actualBaseBranch}`,
			});

			const branchRef = await this.deps.octokit.git.createRef({
				...this.deps.repositories.fork,
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
			this.logger.debug({ branchName, error }, "Branch creation failed, removing from tracking");
			this.activeBranches.delete(branchName);
			throw error;
		}
	}

	/**
	 * Retrieves information about an existing branch.
	 *
	 * @param branchName Name of branch to retrieve
	 *
	 * @example
	 * ```typescript
	 * const branch = await branch.getBranch('main');
	 * if (branch) console.log('Branch exists');
	 * ```
	 */
	public async getBranch(
		branchName: string,
	): Promise<RestEndpointMethodTypes["git"]["getRef"]["response"] | undefined> {
		this.logger.debug({ branchName }, "Looking up branch");

		try {
			const response = await this.deps.octokit.git.getRef({
				...this.deps.repositories.fork,
				ref: `heads/${branchName}`,
			});

			this.logger.debug({ branchName, sha: response.data.object.sha }, "Branch found");

			return response;
		} catch (error) {
			if (error instanceof RequestError && error.status === 404) {
				this.logger.debug({ branchName }, "Branch not found (404)");
				return;
			}

			throw error;
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
	 * await branch.deleteBranch('feature/old-branch');
	 * ```
	 */
	public async deleteBranch(
		branchName: string,
	): Promise<RestEndpointMethodTypes["git"]["deleteRef"]["response"]> {
		this.logger.debug({ branchName }, "Deleting branch");

		const response = await this.deps.octokit.git.deleteRef({
			...this.deps.repositories.fork,
			ref: `heads/${branchName}`,
		});

		this.activeBranches.delete(branchName);

		this.logger.info({ branchName }, "Branch deleted successfully");

		return response;
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
		if (!this.cleanupContentAccess) {
			this.logger.warn("Cleanup content access not set, skipping cleanup");
			return;
		}

		const branchesToCheck = Array.from(this.activeBranches);

		for (const branch of branchesToCheck) {
			try {
				const pr = (await this.cleanupContentAccess.findPullRequestByBranch(branch)) as
					| { number: number }
					| undefined;

				if (!pr) {
					this.logger.info({ branch }, "Cleanup: Deleting branch without PR");
					await this.deleteBranch(branch);
					continue;
				}

				const prStatus = await this.cleanupContentAccess.checkPullRequestStatus(pr.number);

				if (prStatus.needsUpdate) {
					this.logger.info(
						{ branch, prNumber: pr.number, mergeableState: prStatus.needsUpdate },
						"Cleanup: Deleting branch with conflicted PR",
					);

					await this.deleteBranch(branch);
					continue;
				}

				this.logger.info(
					{ branch, prNumber: pr.number },
					"Cleanup: Preserving branch with valid PR",
				);
			} catch (error) {
				this.logger.error({ branch, error }, "Cleanup: Error checking branch, skipping deletion");
			}
		}
	}
}
