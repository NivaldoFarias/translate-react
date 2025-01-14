export class TranslationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

export const ErrorCodes = {
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  CLAUDE_API_ERROR: 'CLAUDE_API_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_CONTENT: 'INVALID_CONTENT',
  TRANSLATION_FAILED: 'TRANSLATION_FAILED',
  NO_FILES_FOUND: 'NO_FILES_FOUND',
} as const; 