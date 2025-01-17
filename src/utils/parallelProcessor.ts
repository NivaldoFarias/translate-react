export interface ParallelOptions {
	batchSize?: number;
	maxConcurrent?: number;
	delayBetweenBatches?: number;
}

export class ParallelProcessor {
	private readonly defaultOptions: Required<ParallelOptions> = {
		batchSize: 5,
		maxConcurrent: 3,
		delayBetweenBatches: 1000,
	};

	async parallel<T, R>(
		items: T[],
		processor: (item: T) => Promise<R>,
		options: ParallelOptions = {},
	) {
		const { batchSize, maxConcurrent, delayBetweenBatches } = {
			...this.defaultOptions,
			...options,
		};

		const results: R[] = [];
		const errors: Error[] = [];

		// Split items into batches
		const batches = this.createBatches(items, batchSize);

		for (const [batchIndex, batch] of batches.entries()) {
			// Process batch with concurrency limit
			const batchPromises = batch.map((item) =>
				this.processWithRetry(item, processor).catch((error) => {
					errors.push(error);
					return undefined;
				}),
			);

			// Wait for the current batch to complete
			const batchResults = await Promise.all(batchPromises);
			results.push(...(batchResults.filter((r) => r !== undefined) as R[]));

			// Delay between batches if not the last batch
			if (batchIndex < batches.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
			}
		}

		return {
			results,
			errors,
			total: items.length,
			successful: results.length,
			failed: errors.length,
		};
	}

	private createBatches<T>(items: T[], batchSize: number): T[][] {
		const batches: T[][] = [];
		for (let i = 0; i < items.length; i += batchSize) {
			batches.push(items.slice(i, i + batchSize));
		}
		return batches;
	}

	private async processWithRetry<T, R>(
		item: T,
		processor: (item: T) => Promise<R>,
		maxRetries = 3,
	): Promise<R> {
		let lastError: Error | undefined;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await processor(item);
			} catch (error) {
				lastError = error as Error;
				if (attempt === maxRetries) break;

				const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		throw lastError;
	}
}
