import { RequestError } from "@octokit/request-error";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { SharedGitHubDependencies } from "./types";

import { baseLogger, registerCleanup } from "@/app/utils/";
import { toSafeErrorLogFields } from "@/shared/errors/";

/**
 * Branch creation, deletion, and lifecycle management for the GitHub API.
 *
 * Handles branch creation, deletion, and lifecycle management with cleanup support.
 */
export class GitHubBranch {
	private readonly logger = baseLogger.child({ component: GitHubBranch.name });

	/** Set of branch names currently being tracked for cleanup */
	public activeBranches = new Set<string>();

	/**
	 * Callback for cleanup operations that need access to pull request lookups.
	 * Set by the unified service to enable cleanup functionality.
	 */
	private cleanupPullRequestAccess?: {
		findPullRequestByBranch: (branchName: string) => Promise<unknown>;
	};

	constructor(private readonly deps: SharedGitHubDependencies) {
		registerCleanup(async () => {
			await this.cleanup();
		});
	}

	/**
	 * Sets the cleanup pull request access callback.
	 *
	 * Called by the unified service to enable cleanup functionality.
	 *
	 * @param access The callback for cleanup operations that need access to pull request lookups
	 * @param access.findPullRequestByBranch The callback to find an open pull request by branch name
	 */
	public setCleanupPullRequestAccess(access: {
		findPullRequestByBranch: (branchName: string) => Promise<unknown>;
	}): void {
		this.cleanupPullRequestAccess = access;
	}

	/**
	 * Retrieves information about an existing branch.
	 *
	 * @param branchName Name of branch to retrieve
	 *
	 * @returns Branch ref response, or `undefined` when the branch does not exist (404)
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
	 * Points a translation branch at an existing commit, creating the branch when missing.
	 *
	 * Moves an existing branch with a single forced `git.updateRef`, so an open pull request
	 * on it keeps its head the whole time. Deleting and recreating the ref instead leaves the
	 * pull request without a head branch, which GitHub cannot merge (pt-br #1182). Only newly
	 * created branches are tracked for {@link GitHubBranch.cleanup}.
	 *
	 * @param branchName Translation branch name without the `refs/heads/` prefix
	 * @param commitSha Commit the branch should point at
	 *
	 * @returns Branch reference data after the move
	 *
	 * @example
	 * ```typescript
	 * const ref = await branch.pointBranchAtCommit("translate/learn/index.md", commit.sha);
	 * ```
	 */
	public async pointBranchAtCommit(
		branchName: string,
		commitSha: string,
	): Promise<RestEndpointMethodTypes["git"]["getRef"]["response"]["data"]> {
		const existingBranch = await this.getBranch(branchName);

		if (existingBranch) {
			const response = await this.deps.octokit.git.updateRef({
				...this.deps.repositories.fork,
				ref: `heads/${branchName}`,
				sha: commitSha,
				force: true,
			});

			this.logger.info(
				{ branchName, previousSha: existingBranch.data.object.sha, sha: commitSha },
				"Branch moved to translation commit",
			);

			return response.data;
		}

		const response = await this.deps.octokit.git.createRef({
			...this.deps.repositories.fork,
			ref: `refs/heads/${branchName}`,
			sha: commitSha,
		});

		this.activeBranches.add(branchName);

		this.logger.info({ branchName, sha: commitSha }, "Branch created at translation commit");

		return response.data;
	}

	/**
	 * Deletes a Git branch and removes it from tracking.
	 * Always removes from tracking even if deletion fails.
	 *
	 * @param branchName Name of branch to delete
	 *
	 * @returns Octokit `git.deleteRef` response
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
	 * Removes tracked branches that have no open pull request.
	 *
	 * Called automatically on process termination (SIGINT and other signals). A branch with
	 * an open pull request is always preserved: deleting it leaves the pull request without
	 * a head branch. Lookup errors also preserve the branch.
	 *
	 * @example
	 * ```typescript
	 * // On SIGINT:
	 * // - Branch "translate/file1.md" has PR #123 → preserved
	 * // - Branch "translate/file2.md" has no PR → deleted
	 * ```
	 */
	protected async cleanup(): Promise<void> {
		if (!this.cleanupPullRequestAccess) {
			this.logger.warn("Cleanup content access not set, skipping cleanup");
			return;
		}

		const branchesToCheck = Array.from(this.activeBranches);

		for (const branch of branchesToCheck) {
			try {
				const pr = (await this.cleanupPullRequestAccess.findPullRequestByBranch(branch)) as
					{ number: number } | undefined;

				if (pr) {
					this.logger.info(
						{ branch, prNumber: pr.number },
						"Cleanup: Preserving branch with open PR",
					);
					continue;
				}

				this.logger.info({ branch }, "Cleanup: Deleting branch without PR");
				await this.deleteBranch(branch);
			} catch (error) {
				this.logger.error(
					{ branch, ...toSafeErrorLogFields(error) },
					"Cleanup: Error checking branch, skipping deletion",
				);
			}
		}
	}
}
