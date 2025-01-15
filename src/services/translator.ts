import type { TranslationFile } from '../types';

import { RateLimiter } from '../utils/rateLimiter';
import { TranslationError, ErrorCodes } from '../utils/errors';
import Logger from '../utils/logger';
import { RetryableOperation } from '../utils/retryableOperation';

import Anthropic from '@anthropic-ai/sdk';

interface TranslationCache {
  content: string;
  timestamp: number;
}

interface TranslationMetrics {
  totalTranslations: number;
  successfulTranslations: number;
  failedTranslations: number;
  cacheHits: number;
  averageTranslationTime: number;
  totalTranslationTime: number;
}

export class TranslatorService {
  private logger = new Logger();
  private claude = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY!,
  });
  private model = process.env.CLAUDE_MODEL! ?? 'claude-3-sonnet-20240229';
  private rateLimiter = new RateLimiter(30, 'Claude API');
  private retryOperation = new RetryableOperation();
  private cache: Map<string, TranslationCache> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  private metrics: TranslationMetrics = {
    totalTranslations: 0,
    successfulTranslations: 0,
    failedTranslations: 0,
    cacheHits: 0,
    averageTranslationTime: 0,
    totalTranslationTime: 0
  };

  private getTranslationPrompt(content: string, glossary: string): string {
    return `You are tasked with translating React documentation from English to Brazilian Portuguese.

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
    ${content}

    Translate the above content following ALL requirements exactly.`;
  }

  async translateContent(file: TranslationFile, glossary: string): Promise<string> {
    const startTime = Date.now();
    this.metrics.totalTranslations++;

    try {
      const cacheKey = `${file.path}:${file.content}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.metrics.cacheHits++;
        this.logger.info(`Using cached translation for: ${file.path}`);
        return cached.content;
      }

      if (file.content.length === 0) {
        throw new TranslationError(
          `File content is empty: ${file.path}`,
          ErrorCodes.INVALID_CONTENT
        );
      }

      this.logger.section('Translation');
      this.logger.info(`Translating file: ${file.path}`);

      const translation = await this.retryOperation.withRetry(
        async () => {
          const message = await this.rateLimiter.schedule(() =>
            this.claude.messages.create({
              model: this.model,
              max_tokens: 4096,
              messages: [ {
                role: 'user',
                content: this.getTranslationPrompt(file.content, glossary)
              } ]
            })
          );
          return message.content[ 0 ].text;
        },
        `Translation of ${file.path}`
      );

      const refined = await this.retryOperation.withRetry(
        () => this.refineTranslation(translation, glossary),
        `Refinement of ${file.path}`
      );

      // Cache the result
      this.cache.set(cacheKey, {
        content: refined,
        timestamp: Date.now()
      });

      // Update metrics
      const translationTime = Date.now() - startTime;
      this.metrics.successfulTranslations++;
      this.metrics.totalTranslationTime += translationTime;
      this.metrics.averageTranslationTime =
        this.metrics.totalTranslationTime / this.metrics.successfulTranslations;

      return refined;

    } catch (error) {
      this.metrics.failedTranslations++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Translation failed: ${message}`);
      throw new TranslationError(
        `Translation failed: ${message}`,
        ErrorCodes.CLAUDE_API_ERROR,
        { filePath: file.path }
      );
    }
  }

  public getMetrics(): TranslationMetrics {
    return { ...this.metrics };
  }

  public async refineTranslation(translation: string, glossary: string): Promise<string> {
    try {
      const message = await this.rateLimiter.schedule(() =>
        this.claude.messages.create({
          model: this.model,
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