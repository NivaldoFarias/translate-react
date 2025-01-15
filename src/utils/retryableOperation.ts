import Logger from './logger';

export class RetryableOperation {
  private logger = new Logger();

  constructor(
    private maxRetries: number = 3,
    private initialDelay: number = 1000,
    private maxDelay: number = 10000
  ) { }

  async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.initialDelay;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt === this.maxRetries) {
          break;
        }

        this.logger.warn(
          `${context} - Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`
        );

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, this.maxDelay);
      }
    }

    throw lastError;
  }
} 