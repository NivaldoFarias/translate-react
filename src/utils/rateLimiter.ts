export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(
    private requestsPerMinute: number,
    private name: string = 'API'
  ) {}

  async schedule<T>(task: () => Promise<T>): Promise<T> {
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
      console.log(`⏳ Rate limiting ${this.name}: waiting ${delay}ms`);
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
} 