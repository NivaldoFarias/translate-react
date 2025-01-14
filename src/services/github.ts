import { Octokit } from '@octokit/rest';
import { TranslationFile } from '../types';
import { RateLimiter } from '../utils/rateLimiter';
import { TranslationError, ErrorCodes } from '../utils/errors';
import { FileTranslator } from './fileTranslator';
import logger from '../utils/logger';

export class GitHubService {
  private octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  private owner = process.env.REPO_OWNER!;
  private repo = process.env.REPO_NAME!;
  private rateLimiter = new RateLimiter(60, 'GitHub API');
  private fileTranslator = new FileTranslator();

  async getUntranslatedFiles(): Promise<TranslationFile[]> {
    logger.info('Scanning repository for untranslated files...');
    logger.clear();

    try {
      const { data } = await this.fetchRepositoryTree();
      const mdFiles = data.tree.filter(file =>
        file.path?.startsWith('src/') &&
        file.path.endsWith('.md')
      );

      logger.info(`Found ${mdFiles.length} markdown files`);
      const untranslatedFiles: TranslationFile[] = [];
      let processed = 0;

      for (const file of mdFiles) {
        try {
          const content = await this.getFileContent(file.path!);
          processed++;
          logger.progress(processed, mdFiles.length, 'Analyzing files');

          if (this.fileTranslator.isFileUntranslated(content)) {
            untranslatedFiles.push({
              path: file.path!,
              content,
              sha: file.sha!
            });
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Skipping ${file.path}: ${message}`);
        }
      }

      logger.clear();
      logger.success(`Found ${untranslatedFiles.length} untranslated files`);
      return untranslatedFiles;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new TranslationError(
        `Failed to fetch repository files: ${message}`,
        ErrorCodes.GITHUB_API_ERROR,
        { owner: this.owner, repo: this.repo }
      );
    }
  }

  private async fetchRepositoryTree() {
    try {
      logger.info('Fetching repository tree...');
      const result = await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.getTree({
          owner: this.owner,
          repo: this.repo,
          tree_sha: 'main',
          recursive: '1'
        })
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch repository tree: ${message}`);
      throw error;
    }
  }

  async getGlossary(): Promise<string> {
    console.log('📖 Fetching translation glossary...');
    const content = await this.getFileContent('GLOSSARY.md');
    return content;
  }

  private async getFileContent(path: string): Promise<string> {
    try {
      const { data } = await this.rateLimiter.schedule(() =>
        this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path,
        })
      );

      if (!('content' in data)) {
        throw new TranslationError(
          'Invalid file content received',
          ErrorCodes.INVALID_CONTENT,
          { path }
        );
      }

      return Buffer.from(data.content, 'base64').toString();

    } catch (error) {
      if (error instanceof TranslationError) throw error;

      const message = error instanceof Error ? error.message : 'Unknown error';

      throw new TranslationError(
        `Failed to fetch file content: ${message}`,
        ErrorCodes.GITHUB_API_ERROR,
        { path }
      );
    }
  }

  async createBranch(filePath: string): Promise<string> {
    const branchName = `translate-${filePath.replace(/\//g, '-')}`;
    console.log(`🌿 Creating branch: ${branchName}`);

    try {
      // Get the SHA of the default branch
      const { data: ref } = await this.rateLimiter.schedule(() =>
        this.octokit.git.getRef({
          owner: this.owner,
          repo: this.repo,
          ref: 'heads/main'
        })
      );

      // Create new branch from main
      await this.rateLimiter.schedule(() =>
        this.octokit.git.createRef({
          owner: this.owner,
          repo: this.repo,
          ref: `refs/heads/${branchName}`,
          sha: ref.object.sha
        })
      );

      return branchName;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new TranslationError(
        `Failed to create branch: ${message}`,
        ErrorCodes.GITHUB_API_ERROR,
        { branchName, filePath }
      );
    }
  }

  async commitTranslation(branch: string, file: TranslationFile, translation: string): Promise<void> {
    console.log(`📝 Committing translation to branch: ${branch}`);

    try {
      // Get the current commit SHA for the branch
      const { data: ref } = await this.rateLimiter.schedule(() =>
        this.octokit.git.getRef({
          owner: this.owner,
          repo: this.repo,
          ref: `heads/${branch}`
        })
      );

      // Create blob with new content
      const { data: blob } = await this.rateLimiter.schedule(() =>
        this.octokit.git.createBlob({
          owner: this.owner,
          repo: this.repo,
          content: translation,
          encoding: 'utf-8'
        })
      );

      // Get the current tree
      const { data: currentCommit } = await this.rateLimiter.schedule(() =>
        this.octokit.git.getCommit({
          owner: this.owner,
          repo: this.repo,
          commit_sha: ref.object.sha
        })
      );

      // Create new tree
      const { data: newTree } = await this.rateLimiter.schedule(() =>
        this.octokit.git.createTree({
          owner: this.owner,
          repo: this.repo,
          base_tree: currentCommit.tree.sha,
          tree: [ {
            path: file.path,
            mode: '100644',
            type: 'blob',
            sha: blob.sha
          } ]
        })
      );

      // Create commit
      const { data: newCommit } = await this.rateLimiter.schedule(() =>
        this.octokit.git.createCommit({
          owner: this.owner,
          repo: this.repo,
          message: `translate: ${file.path}`,
          tree: newTree.sha,
          parents: [ ref.object.sha ]
        })
      );

      // Update branch reference
      await this.rateLimiter.schedule(() =>
        this.octokit.git.updateRef({
          owner: this.owner,
          repo: this.repo,
          ref: `heads/${branch}`,
          sha: newCommit.sha
        })
      );

      console.log(`✅ Successfully committed translation to branch: ${branch}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new TranslationError(
        `Failed to commit translation: ${message}`,
        ErrorCodes.GITHUB_API_ERROR,
        { branch, filePath: file.path }
      );
    }
  }
} 