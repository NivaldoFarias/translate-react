import { Octokit } from "@octokit/rest";

/**
 * Core service for managing Git branches in the translation workflow.
 * Tracks active branches and ensures proper cleanup on process termination.
 *
 * ## Responsibilities
 * - Git branch operations for translation workflow
 * - Branch creation and deletion management
 * - Cleanup operations and process termination handling
 * - Active branch tracking and state management
 */
export class BranchService {
	/**
	 * GitHub API client instance
	 */
	private readonly octokit: Octokit;

	/**
	 * Set of currently active branch names
	 */
	private activeBranches: Set<string> = new Set();

	/**
	 * # Branch Manager Constructor
	 *
	 * Initializes the branch manager and sets up cleanup handlers.
	 *
	 * ## Workflow
	 * 1. Creates Octokit instance
	 * 2. Sets up process termination handlers
	 * 3. Configures error handling
	 *
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @param githubToken - GitHub API token
	 */
	constructor(
		private readonly owner: string,
		private readonly repo: string,
		private readonly githubToken: string,
	) {
		this.octokit = new Octokit({ auth: this.githubToken });

		process.on("SIGINT", async () => await this.cleanup());
		process.on("SIGTERM", async () => await this.cleanup());
		process.on("uncaughtException", async (error) => {
			console.error(`Uncaught exception: ${error.message}`);
			await this.cleanup();
		});
	}

	/**
	 * # Branch Creation
	 *
	 * Creates a new Git branch from a base branch.
	 *
	 * ## Workflow
	 * 1. Gets base branch reference
	 * 2. Creates new branch
	 * 3. Tracks branch for cleanup
	 *
	 * @param branchName - Name for the new branch
	 * @param baseBranch - Branch to create from
	 */
	async createBranch(branchName: string, baseBranch = "main") {
		try {
			const mainBranchRef = await this.octokit.git.getRef({
				owner: this.owner,
				repo: this.repo,
				ref: `heads/${baseBranch}`,
			});

			const branchRef = await this.octokit.git.createRef({
				owner: this.owner,
				repo: this.repo,
				ref: `refs/heads/${branchName}`,
				sha: mainBranchRef.data.object.sha,
			});

			this.activeBranches.add(branchName);
			console.info(`Created and tracking branch: ${branchName}`);

			return branchRef;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error(`Failed to create branch ${branchName}: ${message}`);

			this.activeBranches.delete(branchName);
			throw error;
		}
	}

	/**
	 * # Branch Retrieval
	 *
	 * Fetches information about an existing branch.
	 * Returns null if branch doesn't exist.
	 *
	 * @param branchName - Name of branch to retrieve
	 */
	async getBranch(branchName: string) {
		try {
			return await this.octokit.git.getRef({
				owner: this.owner,
				repo: this.repo,
				ref: `heads/${branchName}`,
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("404")) {
				const message = error instanceof Error ? error.message : "Unknown error";

				console.error(`Error checking branch ${branchName}: ${message}`);
			}

			return null;
		}
	}

	/**
	 * # Branch Deletion
	 *
	 * Removes a Git branch and its tracking.
	 * Always removes from tracking even if deletion fails.
	 *
	 * @param branchName - Name of branch to delete
	 */
	async deleteBranch(branchName: string): Promise<void> {
		try {
			await this.octokit.git.deleteRef({
				owner: this.owner,
				repo: this.repo,
				ref: `heads/${branchName}`,
			});

			console.info(`Deleted branch: ${branchName}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error(`Failed to delete branch ${branchName}: ${message}`);
		} finally {
			// Always remove from tracking, even if API call fails
			this.activeBranches.delete(branchName);
		}
	}

	/**
	 * # Active Branch List
	 *
	 * Retrieves list of currently tracked branches.
	 */
	public getActiveBranches(): string[] {
		return Array.from(this.activeBranches);
	}

	/**
	 * # Branch Cleanup
	 *
	 * Removes all tracked branches.
	 * Called automatically on process termination.
	 *
	 * ## Workflow
	 * 1. Gathers all active branches
	 * 2. Deletes branches in parallel
	 * 3. Reports cleanup status
	 */
	private async cleanup(): Promise<void> {
		console.info(`Cleaning up ${this.activeBranches.size} active branches...`);

		const cleanupPromises = Array.from(this.activeBranches).map((branch) =>
			this.deleteBranch(branch),
		);

		try {
			await Promise.all(cleanupPromises);
			console.info("Branch cleanup completed successfully");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error(`Branch cleanup failed: ${message}`);
		}
	}
}
