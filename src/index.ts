import { config } from 'dotenv';
import { GitHubService } from './services/github';
import { TranslatorService } from './services/translator';
import { TranslationError, ErrorCodes } from './utils/errors';

config();

async function main() {
  console.log('🚀 Starting React docs translation process...');
  
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

    console.log(`📋 Processing ${files.length} files...`);

    for (const file of files) {
      stats.processed++;
      
      try {
        // Create new branch
        const branch = await github.createBranch(file.path);
        stats.branches++;

        // Translate content
        const translation = await translator.translateContent(file, glossary);
        
        // Commit changes
        await github.commitTranslation(branch, file, translation);
        
        stats.translated++;
        console.log(`✅ Completed translation for: ${file.path}`);

      } catch (error) {
        stats.failed++;
        if (error instanceof TranslationError) {
          console.error(`❌ Error processing ${file.path}: [${error.code}] ${error.message}`);
          if (error.context) {
            console.error('Context:', error.context);
          }
        } else {
          console.error(`❌ Unexpected error processing ${file.path}:`, error);
        }
      }
    }

    console.log('🎉 Translation process completed!');
    console.log(`📊 Summary:
    - Files processed: ${stats.processed}
    - Translations completed: ${stats.translated}
    - Failed translations: ${stats.failed}
    - Branches created: ${stats.branches}`);

  } catch (error) {
    console.error('❌ Fatal error during translation process:', error);
    process.exit(1);
  }
}

main(); 