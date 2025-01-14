import { Octokit } from '@octokit/rest';
import { TranslationFile } from '../types';
import { RateLimiter } from '../utils/rateLimiter';
import { TranslationError, ErrorCodes } from '../utils/errors';

interface LanguageAnalysis {
  portugueseScore: number;
  englishScore: number;
  ratio: number;
  isTranslated: boolean;
  patterns: {
    portuguese: number[];
    english: number[];
  };
}

export class GitHubService {
  private octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  private owner = process.env.REPO_OWNER!;
  private repo = process.env.REPO_NAME!;
  private rateLimiter = new RateLimiter(60, 'GitHub API'); // GitHub API allows 5000 requests per hour = ~83 per minute

  async getUntranslatedFiles(): Promise<TranslationFile[]> {
    console.log('🔍 Scanning repository for untranslated files...');

    try {
      const { data } = await this.fetchRepositoryTree();

      const mdFiles = data.tree.filter(file =>
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

  async fetchRepositoryTree() {
    try {
      const result = await this.rateLimiter.schedule(() =>
        this.octokit.rest.git.getTree({
          owner: this.owner,
          repo: this.repo,
          tree_sha: 'main',
          recursive: '1'
        })
      );

      console.log('🌳 Repository tree response:', {
        status: result.status,
        headers: result.headers,
        truncated: result.data.truncated,
        treeCount: result.data.tree.length
      });

      return result;
    } catch (error) {
      console.error('🚨 Failed to fetch repository tree:', {
        owner: this.owner,
        repo: this.repo,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      });

      throw error;
    }
  }

  private isFileUntranslated(content: string): boolean {
    // Skip files that are explicitly marked as translated
    if (content.includes('status: translated')) {
      return false;
    }

    const analysis = this.analyzeLanguage(content);

    // Log detailed analysis
    console.debug('📊 Language analysis:', {
      file: {
        length: content.length,
        lines: content.split('\n').length
      },
      scores: {
        portuguese: analysis.portugueseScore,
        english: analysis.englishScore,
        ratio: `${(analysis.ratio * 100).toFixed(2)}%`
      },
      patterns: {
        portuguese: analysis.patterns.portuguese,
        english: analysis.patterns.english
      }
    });

    return !analysis.isTranslated;
  }

  private analyzeLanguage(content: string): LanguageAnalysis {
    const portuguesePatterns = [
      /\b(são|está|você|também|não|para|como|isso|este|esta|pelo|pela)\b/gi,
      /\b(função|variável|objeto|array|classe|componente|propriedade)\b/gi,
      /\b(exemplo|nota|aviso|importante|observação|lembre-se)\b/gi,
      /\b(código|página|aplicação|desenvolvimento|biblioteca)\b/gi
    ];

    const englishPatterns = [
      /\b(is|are|was|were|has|have|had|been|will|would|should|could|must)\b/g,
      /\b(the|this|that|these|those|there|their|they|them|then|than)\b/g,
      /\b(function|variable|object|array|class|component|property)\b/g,
      /\b(example|note|warning|important|remember|learn|more)\b/g,
      /\b(code|page|application|development|library)\b/g
    ];

    const portugueseMatches = portuguesePatterns.map(pattern =>
      (content.match(pattern) || []).length
    );

    const englishMatches = englishPatterns.map(pattern =>
      (content.match(pattern) || []).length
    );

    const portugueseScore = portugueseMatches.reduce((a, b) => a + b, 0);
    const englishScore = englishMatches.reduce((a, b) => a + b, 0);
    const totalScore = portugueseScore + englishScore;
    const ratio = totalScore > 0 ? portugueseScore / totalScore : 0;

    return {
      portugueseScore,
      englishScore,
      ratio,
      isTranslated: ratio >= 0.3 && !(englishScore > 10 && portugueseScore < 5),
      patterns: {
        portuguese: portugueseMatches,
        english: englishMatches
      }
    };
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