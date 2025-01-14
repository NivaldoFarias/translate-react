import type { TranslationFile } from '../types';
import type { RestEndpointMethodTypes } from '@octokit/rest';

import { Octokit } from '@octokit/rest';
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

  public async getUntranslatedFiles(maxFiles?: number): Promise<TranslationFile[]> {
    logger.section('Repository Scan');
    logger.info('Scanning repository for untranslated files...');

    try {
      const { data } = await this.fetchRepositoryTree();
      const mdFiles = data.tree.filter(file =>
        file.path?.startsWith('src/') &&
        file.path.endsWith('.md')
      ).slice(0, maxFiles ?? data.tree.length);

      if (mdFiles.length === 0) {
        throw new TranslationError(
          'No markdown files found',
          ErrorCodes.NO_FILES_FOUND,
          { maxFiles }
        );
      }

      logger.info(`Found ${mdFiles.length} markdown files`);

      const untranslatedFiles = await this.analyzeFiles(mdFiles);

      logger.success(`Found ${untranslatedFiles.length} untranslated files`);

      return untranslatedFiles;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch repository files: ${message}`);
      throw new TranslationError(
        `Failed to fetch repository files: ${message}`,
        ErrorCodes.GITHUB_API_ERROR,
        { owner: this.owner, repo: this.repo }
      );
    }
  }

  public async analyzeFiles(mdFiles: RestEndpointMethodTypes[ "git" ][ "getTree" ][ "response" ][ "data" ][ "tree" ]) {
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

    return untranslatedFiles;
  }

  public async fetchRepositoryTree() {
    try {
      logger.info('Fetching repository tree...');
      const result = await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.getTree({
          owner: this.owner,
          repo: this.repo,
          tree_sha: 'main',
          recursive: '1',
        })
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch repository tree: ${message}`);
      throw error;
    }
  }

  public async getGlossary(): Promise<string> {
    logger.info('Fetching translation glossary...');
    const content = await this.getFileContent('GLOSSARY.md');
    return content;
  }

  public async getFileContent(path: string): Promise<string> {
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

  public async createBranch(filePath: string): Promise<string> {
    const branchName = `translate-${filePath.replace(/[\s\/]+/g, '-')}-${Date.now()}`;
    logger.info(`Creating branch: ${branchName}`);

    try {
      const { data: ref } = await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.getRef({
          owner: this.owner,
          repo: this.repo,
          ref: 'heads/main'
        })
      );

      await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.createRef({
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

  public async commitTranslation(branch: string, file: TranslationFile, translation: string): Promise<void> {
    logger.info(`Committing translation to branch: ${branch}`);

    try {
      // Get the current commit SHA for the branch
      const { data: ref } = await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.getRef({
          owner: this.owner,
          repo: this.repo,
          ref: `heads/${branch}`
        })
      );

      // Create blob with new content
      const { data: blob } = await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.createBlob({
          owner: this.owner,
          repo: this.repo,
          content: translation,
          encoding: 'utf-8'
        })
      );

      // Get the current tree
      const { data: currentCommit } = await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.getCommit({
          owner: this.owner,
          repo: this.repo,
          commit_sha: ref.object.sha
        })
      );

      // Create new tree
      const { data: newTree } = await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.createTree({
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
        this.octokit.rest.git.createCommit({
          owner: this.owner,
          repo: this.repo,
          message: `translate: ${file.path}`,
          tree: newTree.sha,
          parents: [ ref.object.sha ]
        })
      );

      // Update branch reference
      await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.updateRef({
          owner: this.owner,
          repo: this.repo,
          ref: `heads/${branch}`,
          sha: newCommit.sha
        })
      );

      logger.success(`Successfully committed translation to branch: ${branch}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new TranslationError(
        `Failed to commit translation: ${message}`,
        ErrorCodes.GITHUB_API_ERROR,
        { branch, filePath: file.path }
      );
    }
  }

  public async deleteBranch(branchName: string): Promise<void> {
    await this.rateLimiter.schedule(() =>
      this.octokit.rest.git.deleteRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branchName}`
      })
    );
  }
} 