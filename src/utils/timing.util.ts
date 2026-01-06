import { logger as __logger } from "./logger.util";

export interface TimingResult {
	/** Operation name */
	operation: string;

	/** Duration in milliseconds */
	durationMs: number;

	/** Start timestamp */
	startTime: number;

	/** End timestamp */
	endTime: number;
}

/**
 * Measures execution time of an async operation and logs the result.
 *
 * @param operation Name of the operation being timed
 * @param fn Async function to execute and time
 *
 * @returns Result of the function execution
 *
 * @example
 * ```typescript
 * const result = await timeOperation('fetchFiles', async () => {
 *   return await fetchFiles();
 * });
 * ```
 */
export async function timeOperation<T>(operation: string, fn: () => Promise<T>): Promise<T> {
	const logger = __logger.child({ component: "timeOperation" });

	const startTime = Date.now();

	try {
		const result = await fn();
		const endTime = Date.now();
		const durationMs = endTime - startTime;

		logger.debug(
			{
				operation,
				durationMs,
				durationSeconds: (durationMs / 1000).toFixed(2),
			},
			`${operation} completed in ${(durationMs / 1000).toFixed(2)}s`,
		);

		return result;
	} catch (error) {
		const endTime = Date.now();
		const durationMs = endTime - startTime;

		logger.error(
			{
				operation,
				durationMs,
				durationSeconds: (durationMs / 1000).toFixed(2),
				error,
			},
			`${operation} failed after ${(durationMs / 1000).toFixed(2)}s`,
		);

		throw error;
	}
}

/**
 * Simple timer class for manual timing measurements.
 *
 * Use when you need fine-grained control over timing points.
 *
 * @example
 * ```typescript
 * const timer = new Timer('myOperation');
 * // ... do work ...
 * const result = timer.stop();
 * console.log(`Operation took ${result.durationMs}ms`);
 * ```
 */
export class Timer {
	private startTime: number;

	/**
	 * Creates a new timer and starts it immediately.
	 *
	 * @param operation Name of the operation being timed
	 */
	constructor(private readonly operation: string) {
		this.startTime = Date.now();
	}

	/**
	 * Stops the timer and returns timing result.
	 *
	 * @returns Timing result with duration information
	 */
	public stop(): TimingResult {
		const endTime = Date.now();
		return {
			operation: this.operation,
			durationMs: endTime - this.startTime,
			startTime: this.startTime,
			endTime,
		};
	}

	/**
	 * Gets current elapsed time without stopping the timer.
	 *
	 * @returns Elapsed time in milliseconds
	 */
	public elapsed(): number {
		return Date.now() - this.startTime;
	}
}
