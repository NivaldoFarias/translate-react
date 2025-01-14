import Anthropic from '@anthropic-ai/sdk';
import { TranslationFile } from '../types';
import { RateLimiter } from '../utils/rateLimiter';
import { TranslationError, ErrorCodes } from '../utils/errors';
import logger from '../utils/logger';

export class TranslatorService {
  private claude = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY!,
  });
  // Claude API rate limit varies by tier, adjust as needed
  private rateLimiter = new RateLimiter(30, 'Claude API');

  async translateContent(file: TranslationFile, glossary: string): Promise<string> {
    if (file.content.length === 0) {
      throw new TranslationError(
        `File content is empty: ${file.path}`,
        ErrorCodes.INVALID_CONTENT
      );
    }

    logger.section('Translation');
    logger.info(`Translating file: ${file.path}`);

    try {
      const message = await this.rateLimiter.schedule(() =>
        this.claude.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4096,
          messages: [ {
            role: 'user',
            content: `You are tasked with translating React documentation from English to Brazilian Portuguese.

            CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:
            1. MUST maintain all original markdown formatting, including code blocks, links, and special syntax
            2. MUST preserve all original code examples exactly as they are
            3. MUST keep all original HTML tags intact
            4. MUST follow the glossary rules below STRICTLY - these are non-negotiable terms
            5. MUST maintain all original frontmatter
            6. MUST preserve all original line breaks and paragraph structure
            7. MUST NOT translate code variables, function names, or technical terms not in the glossary
            8. MUST NOT add or remove any content
            9. MUST NOT change any URLs or links
            10. MUST translate comments within code blocks according to the glossary

            GLOSSARY RULES:
            ${glossary}

            CONTENT TO TRANSLATE:
            ${file.content}

            Translate the above content following ALL requirements exactly.`
          } ]
        })
      );


      const translation = message.content[ 0 ].text;

      logger.info('Refining translation...');
      return await this.refineTranslation(translation, glossary);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Translation failed: ${message}`);
      throw new TranslationError(
        `Translation failed: ${message}`,
        ErrorCodes.CLAUDE_API_ERROR,
        { filePath: file.path }
      );
    }
  }

  private async refineTranslation(translation: string, glossary: string): Promise<string> {
    try {
      const message = await this.rateLimiter.schedule(() =>
        this.claude.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4096,
          messages: [ {
            role: 'user',
            content: `You are tasked with verifying and refining a Brazilian Portuguese translation of React documentation.

            VERIFICATION REQUIREMENTS - YOU MUST CHECK ALL OF THESE:
            1. MUST verify all glossary terms are translated correctly and consistently
            2. MUST ensure all markdown formatting is preserved exactly
            3. MUST confirm all code blocks and technical terms remain unchanged
            4. MUST verify all HTML tags are intact and unchanged
            5. MUST check that all links and URLs are preserved
            6. MUST validate that the translation maintains the original structure
            7. MUST ensure no content is added or removed
            8. MUST verify that code comments are translated according to glossary
            9. MUST maintain consistent technical terminology
            10. MUST preserve all frontmatter exactly as in original

            If any requirement is not met, fix it according to these rules:

            GLOSSARY RULES:
            ${glossary}

            TRANSLATION TO VERIFY AND REFINE:
            ${translation}

            Return the verified and refined translation, ensuring ALL requirements are met exactly.`
          } ]
        })
      );

      return message.content[ 0 ].text;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new TranslationError(
        `Translation refinement failed: ${message}`,
        ErrorCodes.TRANSLATION_FAILED
      );
    }
  }
} 