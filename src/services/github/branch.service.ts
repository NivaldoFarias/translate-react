import { BaseGitHubService } from "@/services/github/base.service";

/**
 * Service responsible for Git branch operations and lifecycle management.
 * Handles branch creation, deletion, and cleanup tasks.
 *
 * ## Responsibilities
 * - Branch creation and deletion
 * - Branch state tracking
 * - Automatic cleanup on process termination
 * - Error handling and recovery
 */
export class BranchService extends BaseGitHubService {
	/** Set of branch names currently being tracked for cleanup */
	protected activeBranches: Set<string> = new Set();

	/**
	 * Creates a new branch service instance.
	 * Initializes the GitHub client and sets up cleanup handlers.
	 *
	 * @param upstream Original repository details
	 * @param fork Forked repository details
	 * @param githubToken GitHub personal access token
	 */
	constructor(
		protected readonly upstream: { owner: string; repo: string },
		protected readonly fork: { owner: string; repo: string },
		protected readonly githubToken = import.meta.env.GITHUB_TOKEN,
	) {
		super(upstream, fork, githubToken);

		this.setupCleanupHandlers();
	}

	/**
	 * Sets up process termination handlers for branch cleanup.
	 * Ensures branches are cleaned up on process exit or errors.
	 */
	protected setupCleanupHandlers() {
		process.on("SIGINT", async () => await this.cleanup());
		process.on("SIGTERM", async () => await this.cleanup());
		process.on("uncaughtException", async () => await this.cleanup());
	}

	/**
	 * Creates a new Git branch from a base branch.
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
	public async createBranch(branchName: string, baseBranch = "main") {
		try {
			const mainBranchRef = await this.octokit.git.getRef({
				...this.fork,
				ref: `heads/${baseBranch}`,
			});

			const branchRef = await this.octokit.git.createRef({
				...this.fork,
				ref: `refs/heads/${branchName}`,
				sha: mainBranchRef.data.object.sha,
			});

			this.activeBranches.add(branchName);

			return branchRef;
		} catch (error) {
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
	 * const branch = await branchService.getBranch('main');
	 * if (branch) console.log('Branch exists');
	 * ```
	 */
	public async getBranch(branchName: string) {
		try {
			return await this.octokit.git.getRef({
				...this.fork,
				ref: `heads/${branchName}`,
			});
		} catch {
			return null;
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
	public async deleteBranch(branchName: string) {
		await this.octokit.git.deleteRef({
			...this.fork,
			ref: `heads/${branchName}`,
		});

		this.activeBranches.delete(branchName);
	}

	/**
	 * Retrieves list of currently tracked branches.
	 *
	 * @example
	 * ```typescript
	 * const branches = branchService.getActiveBranches();
	 * console.log(`Active branches: ${branches.join(', ')}`);
	 * ```
	 */
	public getActiveBranches() {
		return Array.from(this.activeBranches);
	}

	/**
	 * Removes all tracked branches.
	 * Called automatically on process termination.
	 */
	protected async cleanup() {
		await Promise.all(Array.from(this.activeBranches).map((branch) => this.deleteBranch(branch)));
	}

	/**
	 * # Fork Commit Check
	 *
	 * Verifies if commits exist on the fork from the current user.
	 * Used to determine if translation work has already been done.
	 */
	public async checkIfCommitExistsOnFork(branchName: string) {
		const forkRef = await this.getBranch(branchName);

		const listCommitsResponse = await this.octokit.repos.listCommits({
			...this.fork,
			sha: forkRef?.data.object.sha,
		});

		return listCommitsResponse.data.some(
			(commit) => commit?.author?.login === import.meta.env.REPO_FORK_OWNER!,
		);
	}
}
