import { Octokit } from '@octokit/rest';
import Logger from './logger';

export class BranchManager {
  private activeBranches: Set<string> = new Set();
  private logger = new Logger();
  private octokit: Octokit;

  constructor(
    private owner: string,
    private repo: string,
    githubToken: string
  ) {
    this.octokit = new Octokit({ auth: githubToken });

    // Setup cleanup handlers
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('uncaughtException', (error) => {
      this.logger.error(`Uncaught exception: ${error.message}`);
      this.cleanup();
    });
  }

  async createBranch(branchName: string, baseBranch: string = 'main'): Promise<void> {
    try {
      // Get the SHA of the base branch
      const { data: ref } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${baseBranch}`
      });

      // Create new branch
      await this.octokit.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha
      });

      this.activeBranches.add(branchName);
      this.logger.info(`Created and tracking branch: ${branchName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create branch ${branchName}: ${message}`);
      // Don't track the branch if creation failed
      this.activeBranches.delete(branchName);
      throw error;
    }
  }

  async deleteBranch(branchName: string): Promise<void> {
    try {
      await this.octokit.git.deleteRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branchName}`
      });

      this.logger.info(`Deleted branch: ${branchName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
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
    this.logger.section('Branch Cleanup');
    this.logger.info(`Cleaning up ${this.activeBranches.size} active branches...`);

    const cleanupPromises = Array.from(this.activeBranches).map(branch =>
      this.deleteBranch(branch)
    );

    try {
      await Promise.all(cleanupPromises);
      this.logger.info('Branch cleanup completed successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Branch cleanup failed: ${message}`);
    }
  }
} 