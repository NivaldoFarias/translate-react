import Logger from './logger';

export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private logger = new Logger();
  private currentOperation: string = '';
  private operationStartTime: number = 0;

  constructor(
    private requestsPerMinute: number,
    private name: string = 'API'
  ) { }

  private isTestEnvironment(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';
  }

  async schedule<T>(task: () => Promise<T>, operation: string = ''): Promise<T> {
    if (this.isTestEnvironment()) {
      return task();
    }

    this.currentOperation = operation;
    this.operationStartTime = Date.now();

    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeWithDelay(task);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async executeWithDelay<T>(task: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minDelay = (60 * 1000) / this.requestsPerMinute;

    if (timeSinceLastRequest < minDelay) {
      const delay = minDelay - timeSinceLastRequest;
      const elapsedTime = ((now - this.operationStartTime) / 1000).toFixed(1);
      const context = this.currentOperation ? ` - ${this.currentOperation}` : '';
      this.logger.progress(1, 1, `${this.name}${context} (${elapsedTime}s, rate limit: ${Math.round(delay)}ms)`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
    return task();
  }

  private async processQueue() {
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }

    this.processing = false;
  }

  public reset(): void {
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    this.currentOperation = '';
    this.operationStartTime = 0;
  }
} 