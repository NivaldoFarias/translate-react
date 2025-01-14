import Anthropic from '@anthropic-ai/sdk';
import { TranslationFile } from '../types';
import { RateLimiter } from '../utils/rateLimiter';
import { TranslationError, ErrorCodes } from '../utils/errors';

export class TranslatorService {
  private claude: Anthropic;
  private rateLimiter: RateLimiter;

  constructor() {
    this.claude = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY!,
    });
    // Claude API rate limit varies by tier, adjust as needed
    this.rateLimiter = new RateLimiter(30, 'Claude API');
  }

  async translateContent(file: TranslationFile, glossary: string): Promise<string> {
    console.log(`🔄 Translating file: ${file.path}`);

    try {
      const message = await this.rateLimiter.schedule(() =>
        this.claude.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: `Translate the following React documentation from English to Brazilian Portuguese. 
                      Follow these rules from the glossary:
                      ${glossary}
                      
                      Content to translate:
                      ${file.content}`
          }]
        })
      );

      const translation = message.content[0].text;
      
      console.log('✨ Refining translation according to glossary...');
      return await this.refineTranslation(translation, glossary);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

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
          messages: [{
            role: 'user',
            content: `Verify and refine this translation according to the glossary rules:
                      ${glossary}
                      
                      Translation to verify:
                      ${translation}`
          }]
        })
      );

      return message.content[0].text;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      throw new TranslationError(
        `Translation refinement failed: ${message}`,
        ErrorCodes.TRANSLATION_FAILED
      );
    }
  }
} 