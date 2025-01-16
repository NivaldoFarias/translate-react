import Logger from "./logger";

export class RateLimiter {
	private queue: Array<() => Promise<void>> = [];
	private isProcessing = false;
	private lastRequestTime = 0;
	private logger = new Logger();
	private currentOperation: string = "";
	private operationStartTime: number = 0;

	constructor(
		private _requestsPerMinute: number,
		private _name = "default",
	) {}

	private isTestEnvironment(): boolean {
		return process.env.NODE_ENV === "test" || process.env["BUN_ENV"] === "test";
	}

	async schedule<T>(task: () => Promise<T>, operation: string = ""): Promise<T> {
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

			if (!this.isProcessing) {
				this.processQueue();
			}
		});
	}

	private async executeWithDelay<T>(task: () => Promise<T>): Promise<T> {
		const now = Date.now();
		const timeSinceLastRequest = now - this.lastRequestTime;
		const minDelay = (60 * 1000) / this._requestsPerMinute;

		if (timeSinceLastRequest < minDelay) {
			const delay = minDelay - timeSinceLastRequest;
			const elapsedTime = ((now - this.operationStartTime) / 1000).toFixed(1);
			const context = this.currentOperation ? ` - ${this.currentOperation}` : "";

			this.logger.debug(
				`Rate limiting ${this._name}${context} - Waiting ${Math.round(
					delay,
				)}ms (${this._requestsPerMinute} requests/min)`,
			);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		try {
			this.lastRequestTime = Date.now();
			return await task();
		} catch (error) {
			if (error instanceof Error && error.message.includes("rate limit")) {
				const retryDelay = 60 * 1000;
				this.logger.warn(
					`Rate limit exceeded for ${this._name}, waiting ${retryDelay / 1000} seconds...`,
				);
				await new Promise((resolve) => setTimeout(resolve, retryDelay));
				return this.executeWithDelay(task);
			}
			throw error;
		}
	}

	private async processQueue() {
		this.isProcessing = true;

		while (this.queue.length > 0) {
			const task = this.queue.shift();
			if (task) {
				await task();
			}
		}

		this.isProcessing = false;
	}

	public reset(): void {
		this.queue = [];
		this.isProcessing = false;
		this.lastRequestTime = 0;
		this.currentOperation = "";
		this.operationStartTime = 0;
	}
}
