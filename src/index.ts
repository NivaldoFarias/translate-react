import { config } from 'dotenv';
import { GitHubService } from './services/github';
import { TranslatorService } from './services/translator';
import { TranslationError } from './utils/errors';
import Logger from './utils/logger';

config();

async function main() {
  const logger = new Logger();

  logger.info('Starting React docs translation process');

  const github = new GitHubService();
  const translator = new TranslatorService();

  const stats = {
    processed: 0,
    translated: 0,
    failed: 0,
    branches: 0
  };

  try {
    const files = await github.getUntranslatedFiles();
    const glossary = await github.getGlossary();

    logger.info(`Processing ${files.length} files`);

    for (const file of files) {
      stats.processed++;
      logger.progress(stats.processed, files.length, 'Translating files');

      try {
        const branch = await github.createBranch(file.path);
        stats.branches++;

        const translation = await translator.translateContent(file, glossary);
        await github.commitTranslation(branch, file, translation);

        stats.translated++;
        logger.success(`Completed translation for: ${file.path}`);

      } catch (error) {
        stats.failed++;
        if (error instanceof TranslationError) {
          logger.error(`Error processing ${file.path}: [${error.code}] ${error.message}`);
        } else {
          logger.error(`Unexpected error processing ${file.path}`);
        }
      }
    }

    logger.success('Translation process completed!');
    logger.info(`Summary:
    Files processed: ${stats.processed}
    Translations completed: ${stats.translated}
    Failed translations: ${stats.failed}
    Branches created: ${stats.branches}`);

  } catch (error) {
    logger.error('Fatal error during translation process');
    process.exit(1);
  }
}

main(); 