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
    return `You are a precise translator specializing in technical documentation. Your task is to translate React documentation from English to Brazilian Portuguese in a single, high-quality pass.

    TRANSLATION AND VERIFICATION REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:
    1. MUST maintain all original markdown formatting, including code blocks, links, and special syntax
    2. MUST preserve all original code examples exactly as they are
    3. MUST keep all original HTML tags intact and unchanged
    4. MUST follow the glossary rules below STRICTLY - these are non-negotiable terms
    5. MUST maintain all original frontmatter exactly as in original
    6. MUST preserve all original line breaks and paragraph structure
    7. MUST NOT translate code variables, function names, or technical terms not in the glossary
    8. MUST NOT add or remove any content
    9. MUST NOT change any URLs or links
    10. MUST translate comments within code blocks according to the glossary
    11. MUST maintain consistent technical terminology throughout the translation
    12. MUST ensure the translation reads naturally in Brazilian Portuguese while preserving technical accuracy

    GLOSSARY RULES:
    ${glossary}

    CONTENT TO TRANSLATE:
    ${content}

    IMPORTANT: Respond ONLY with the final translated content. Do not include any explanations, notes, or the original content.
    Start your response with the translation immediately.`;
  }

  async translateContent(file: TranslationFile, glossary: string): Promise<string> {
    const startTime = Date.now();
    this.metrics.totalTranslations++;

    try {
      const cacheKey = `${file.path}:${file.content}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.metrics.cacheHits++;
        return cached.content;
      }

      if (file.content.length === 0) {
        throw new TranslationError(
          `File content is empty: ${file.path}`,
          ErrorCodes.INVALID_CONTENT
        );
      }

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

      // Cache the result
      this.cache.set(cacheKey, {
        content: translation,
        timestamp: Date.now()
      });

      // Update metrics
      const translationTime = Date.now() - startTime;
      this.metrics.successfulTranslations++;
      this.metrics.totalTranslationTime += translationTime;
      this.metrics.averageTranslationTime =
        this.metrics.totalTranslationTime / this.metrics.successfulTranslations;

      return translation;

    } catch (error) {
      this.metrics.failedTranslations++;
      const message = error instanceof Error ? error.message : 'Unknown error';
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
} 