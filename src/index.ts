import { config } from 'dotenv';
import { GitHubService } from './services/github';
import { TranslatorService } from './services/translator';
import { TranslationError } from './utils/errors';
import Logger from './utils/logger';

config();

async function main() {
  const logger = new Logger();

  // Validate required environment variables
  const requiredEnvVars = [ 'GITHUB_TOKEN', 'REPO_OWNER', 'REPO_NAME' ];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[ varName ]);

  if (missingEnvVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    logger.info('Please create a .env file with the following variables:');
    logger.info(`
GITHUB_TOKEN=your_github_token
REPO_OWNER=target_repo_owner
REPO_NAME=target_repo_name
MAX_FILES=10 (optional, defaults to all files)`);
    process.exit(1);
  }

  const github = new GitHubService(
    process.env.REPO_OWNER!,
    process.env.REPO_NAME!,
    process.env.GITHUB_TOKEN!
  );
  const translator = new TranslatorService();

  const stats = {
    processed: 0,
    translated: 0,
    failed: 0,
    branches: 0,
    startTime: Date.now()
  };

  try {
    // Get max files from environment or use undefined for all files
    const maxFiles = process.env.MAX_FILES ? parseInt(process.env.MAX_FILES) : undefined;

    // First get the files to estimate total time
    const files = await github.getUntranslatedFiles(maxFiles);

    // Calculate time estimates
    const avgTimePerFile = 60; // seconds per file for translation
    const githubOpsPerFile = 3; // getContent, createBranch, commitTranslation
    const githubRateDelay = (60 / 60) * 1000; // 60 requests per minute = 1 second delay
    const estimatedGithubTime = files.length * githubOpsPerFile * githubRateDelay / 1000; // in seconds
    const estimatedTranslationTime = files.length * avgTimePerFile;
    const totalEstimatedTime = Math.ceil((estimatedGithubTime + estimatedTranslationTime) / 60); // in minutes

    logger.info(`Found ${files.length} files to translate (est. ${totalEstimatedTime} minutes)`);

    for (const file of files) {
      stats.processed++;
      const remainingFiles = files.length - stats.processed;
      const elapsedMinutes = (Date.now() - stats.startTime) / (1000 * 60);
      const avgTimePerFile = elapsedMinutes / stats.processed;
      const estimatedRemaining = Math.ceil(remainingFiles * avgTimePerFile);

      logger.progress(
        stats.processed,
        files.length,
        `Translating ${file.path} (${stats.processed}/${files.length}, ${estimatedRemaining}m remaining)`
      );

      try {
        const branch = await github.createTranslationBranch();
        stats.branches++;

        const translation = await translator.translateContent(file, '');
        await github.commitTranslation(
          branch,
          file.path,
          translation,
          `Translate ${file.path} to Brazilian Portuguese`
        );

        stats.translated++;

      } catch (error) {
        stats.failed++;
        if (error instanceof TranslationError) {
          logger.error(`Failed: ${file.path} [${error.code}] ${error.message}`);
        } else {
          logger.error(`Failed: ${file.path}`);
        }
      }
    }

    const totalMinutes = Math.ceil((Date.now() - stats.startTime) / (1000 * 60));
    logger.success(`Translation completed in ${totalMinutes} minutes`);
    logger.info(`Summary:
    Files processed: ${stats.processed}
    Translations completed: ${stats.translated}
    Failed translations: ${stats.failed}
    Branches created: ${stats.branches}
    Total time: ${totalMinutes} minutes`);

  } catch (error) {
    logger.error('Fatal error during translation process');
    process.exit(1);
  }
}

main(); 