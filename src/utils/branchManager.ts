import { Octokit } from "@octokit/rest";

import Logger from "./logger";

export class BranchManager {
	private activeBranches: Set<string> = new Set();
	private logger = new Logger();
	private octokit: Octokit;

	constructor(
		private readonly owner: string,
		private readonly repo: string,
		private readonly githubToken: string,
	) {
		this.octokit = new Octokit({ auth: this.githubToken });

		process.on("SIGINT", () => this.cleanup());
		process.on("SIGTERM", () => this.cleanup());
		process.on("uncaughtException", (error) => {
			this.logger.error(`Uncaught exception: ${error.message}`);
			this.cleanup();
		});
	}

	async createBranch(branchName: string, baseBranch: string = "main") {
		try {
			const { data } = await this.octokit.git.getRef({
				owner: this.owner,
				repo: this.repo,
				ref: `heads/${baseBranch}`,
			});

			await this.octokit.git.createRef({
				owner: this.owner,
				repo: this.repo,
				ref: `refs/heads/${branchName}`,
				sha: data.object.sha,
			});

			this.activeBranches.add(branchName);
			this.logger.info(`Created and tracking branch: ${branchName}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			this.logger.error(`Failed to create branch ${branchName}: ${message}`);

			this.activeBranches.delete(branchName);
			throw error;
		}
	}

	async getBranch(branchName: string) {
		try {
			const { data } = await this.octokit.git.getRef({
				owner: this.owner,
				repo: this.repo,
				ref: `heads/${branchName}`,
			});

			return data?.object.sha ?? null;
		} catch (_error) {
			return null;
		}
	}

	async deleteBranch(branchName: string): Promise<void> {
		try {
			await this.octokit.git.deleteRef({
				owner: this.owner,
				repo: this.repo,
				ref: `heads/${branchName}`,
			});

			this.logger.info(`Deleted branch: ${branchName}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			this.logger.error(`Failed to delete branch ${branchName}: ${message}`);
		} finally {
			// Always remove from tracking, even if API call fails
			this.activeBranches.delete(branchName);
		}
	}

	getActiveBranches(): string[] {
		return Array.from(this.activeBranches);
	}

	private async cleanup(): Promise<void> {
		this.logger.info(`Cleaning up ${this.activeBranches.size} active branches...`);

		const cleanupPromises = Array.from(this.activeBranches).map((branch) =>
			this.deleteBranch(branch),
		);

		try {
			await Promise.all(cleanupPromises);
			this.logger.info("Branch cleanup completed successfully");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			this.logger.error(`Branch cleanup failed: ${message}`);
		}
	}
}
