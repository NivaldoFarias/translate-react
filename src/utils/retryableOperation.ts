import Logger from "./logger";

export class RetryableOperation {
	private logger = new Logger();

	constructor(
		private maxRetries: number,
		private initialDelay: number,
		private maxDelay: number,
	) {}

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

				// Check if error is retryable
				const isRetryable = this.isRetryableError(lastError);
				if (!isRetryable) {
					this.logger.error(`Non-retryable error encountered: ${lastError.message}`);
					throw lastError;
				}

				this.logger.warn(
					`${context} - Attempt ${attempt}/${this.maxRetries} failed: ${lastError.message}. Retrying in ${delay}ms...`,
				);

				await new Promise((resolve) => setTimeout(resolve, delay));
				delay = Math.min(delay * 2, this.maxDelay);
			}
		}

		this.logger.error(
			`${context} - All ${this.maxRetries} retry attempts failed. Last error: ${lastError?.message}`,
		);
		throw lastError;
	}

	private isRetryableError(error: Error): boolean {
		if (!error.message) return true;

		const nonRetryableErrors = [
			"Bad credentials",
			"Not Found",
			"Unauthorized",
			"Forbidden",
			"Validation failed",
		];

		return !nonRetryableErrors.some((msg) => error.message.includes(msg));
	}
}
