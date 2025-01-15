import { Octokit } from '@octokit/rest';
import type { TranslationFile } from '../types';
import type { RestEndpointMethodTypes } from '@octokit/rest';
import { RateLimiter } from '../utils/rateLimiter';
import Logger from '../utils/logger';
import { BranchManager } from '../utils/branchManager';

export class GitHubService {
  private octokit: Octokit;
  private logger = new Logger();
  private rateLimiter = new RateLimiter(60, 'GitHub API');
  private branchManager: BranchManager;

  constructor(
    private owner: string,
    private repo: string,
    githubToken: string
  ) {
    this.octokit = new Octokit({ auth: githubToken });
    this.branchManager = new BranchManager(owner, repo, githubToken);
  }

  public async getUntranslatedFiles(maxFiles?: number): Promise<TranslationFile[]> {
    try {
      const { data: tree } = await this.rateLimiter.schedule(() =>
        this.octokit.git.getTree({
          owner: this.owner,
          repo: this.repo,
          tree_sha: 'main',
          recursive: '1'
        })
        , 'Fetching repository tree');

      // Filter out ignored paths
      const ignoredDirs = [
        '.github/',
        '.circleci/',
        '.husky/',
        '.vscode/',
        'scripts/',
        'node_modules/'
      ];

      const ignoredRootFiles = [
        'CODE_OF_CONDUCT.md',
        'CONTRIBUTING.md',
        'LICENSE.md',
        'README.md',
        'SECURITY.md',
        'CHANGELOG.md'
      ];

      const markdownFiles = tree.tree
        .filter(item => {
          if (!item.path?.endsWith('.md')) return false;

          // Check if file is in ignored directory
          if (ignoredDirs.some(dir => item.path!.startsWith(dir))) return false;

          // Check if file is an ignored root file
          if (!item.path.includes('/') && ignoredRootFiles.includes(item.path)) return false;

          return true;
        })
        .slice(0, maxFiles);

      const files: TranslationFile[] = [];
      for (const file of markdownFiles) {
        if (!file.path) continue;

        const { data: content } = await this.rateLimiter.schedule(() =>
          this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: file.path!
          })
          , `Fetching ${file.path}`);

        if ('content' in content) {
          const decodedContent = Buffer.from(content.content, 'base64').toString();
          files.push({
            path: file.path,
            content: decodedContent,
            sha: content.sha
          });
        }
      }

      return files;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch untranslated files: ${message}`);
      throw error;
    }
  }

  async createTranslationBranch(baseBranch: string = 'main'): Promise<string> {
    const branchName = `translate-${Date.now()}`;
    await this.branchManager.createBranch(branchName, baseBranch);
    return branchName;
  }

  async commitTranslation(
    branch: string,
    filePath: string,
    content: string,
    message: string
  ): Promise<void> {
    try {
      // Get the current file (if it exists)
      let currentFile: RestEndpointMethodTypes[ 'repos' ][ 'getContent' ][ 'response' ] | undefined;
      try {
        currentFile = await this.rateLimiter.schedule(() =>
          this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: filePath,
            ref: branch
          })
          , `Checking existing file: ${filePath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`File not found: ${message}`);
      }

      await this.rateLimiter.schedule(() =>
        this.octokit.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          message,
          content: Buffer.from(content).toString('base64'),
          branch,
          sha: currentFile && 'data' in currentFile ?
            ('sha' in currentFile.data ? currentFile.data.sha : undefined) :
            undefined
        })
        , `Committing changes to ${filePath}`);

      this.logger.info(`Committed translation to ${filePath} on branch ${branch}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to commit translation: ${errorMessage}`);

      // Clean up the branch on failure
      await this.branchManager.deleteBranch(branch);
      throw error;
    }
  }

  async createPullRequest(
    branch: string,
    title: string,
    body: string,
    baseBranch: string = 'main'
  ): Promise<number> {
    try {
      const { data: pr } = await this.rateLimiter.schedule(() =>
        this.octokit.pulls.create({
          owner: this.owner,
          repo: this.repo,
          title,
          body,
          head: branch,
          base: baseBranch
        })
      );

      this.logger.info(`Created pull request #${pr.number}: ${title}`);
      return pr.number;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create pull request: ${errorMessage}`);

      // Clean up the branch on failure
      await this.branchManager.deleteBranch(branch);
      throw error;
    }
  }

  async cleanupBranch(branch: string): Promise<void> {
    await this.branchManager.deleteBranch(branch);
  }

  getActiveBranches(): string[] {
    return this.branchManager.getActiveBranches();
  }
} 