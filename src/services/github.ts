import { Octokit } from 'octokit';
import { TranslationFile } from '../types';
import { RateLimiter } from '../utils/rateLimiter';
import { TranslationError, ErrorCodes } from '../utils/errors';

export class GitHubService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private rateLimiter: RateLimiter;

  constructor() {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.owner = process.env.REPO_OWNER!;
    this.repo = process.env.REPO_NAME!;
    // GitHub API allows 5000 requests per hour = ~83 per minute
    this.rateLimiter = new RateLimiter(60, 'GitHub API');
  }

  async getUntranslatedFiles(): Promise<TranslationFile[]> {
    console.log('🔍 Scanning repository for untranslated files...');
    
    try {
      const { data: tree } = await this.rateLimiter.schedule(() => 
        this.octokit.rest.git.getTree({
          owner: this.owner,
          repo: this.repo,
          tree_sha: 'main',
          recursive: '1'
        })
      );

      const mdFiles = tree.tree.filter(file => 
        file.path?.startsWith('src/') && 
        file.path.endsWith('.md')
      );

      const untranslatedFiles: TranslationFile[] = [];

      for (const file of mdFiles) {
        try {
          const content = await this.getFileContent(file.path!);
          if (this.isFileUntranslated(content)) {
            untranslatedFiles.push({
              path: file.path!,
              content,
              sha: file.sha!
            });
          }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        console.warn(`⚠️ Skipping file ${file.path}: ${message}`);
      }
    }

      console.log(`📊 Found ${untranslatedFiles.length} untranslated files`);
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

  private isFileUntranslated(content: string): boolean {
    // Implement logic to detect if content is in English
    // This could check for Portuguese markers or common translated terms
    return true; // Placeholder
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
    
    // Implementation here
    
    return branchName;
  }

  async commitTranslation(branch: string, file: TranslationFile, translation: string): Promise<void> {
    console.log(`📝 Committing translation to branch: ${branch}`);
    // Implementation here
  }
} 