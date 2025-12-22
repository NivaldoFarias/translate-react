import { logger } from "./logger.util";

/**
 * Configuration for exponential backoff retry logic.
 *
 * Controls how retries are performed when API calls fail due to
 * transient errors (rate limits, server errors, timeouts).
 */
export interface BackoffConfig {
	/** Initial delay in milliseconds before first retry */
	initialDelay: number;

	/** Maximum delay in milliseconds between retries */
	maxDelay: number;

	/** Maximum number of retry attempts before giving up */
	maxRetries: number;

	/** Multiplier for exponential backoff (typically 2 for doubling) */
	multiplier: number;

	/** Add random jitter to prevent thundering herd */
	jitter: boolean;
}

/** Default exponential backoff configuration */
export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
	initialDelay: 1000,
	maxDelay: 60_000,
	maxRetries: 5,
	multiplier: 2,
	jitter: true,
};

/**
 * Executes an async operation with exponential backoff retry logic.
 *
 * Automatically retries failed operations with increasing delays between
 * attempts. Useful for handling transient API failures (rate limits,
 * server errors) without overwhelming the service.
 *
 * The delay between retries grows exponentially:
 * - Attempt 1: `initialDelay` ms
 * - Attempt 2: `initialDelay * multiplier` ms
 * - Attempt 3: `initialDelay * multiplier^2` ms
 * - etc. (capped at `maxDelay`)
 *
 * @param operation Async function to execute with retry logic
 * @param config Backoff configuration (uses defaults if not provided)
 *
 * @returns Promise resolving to the operation result
 *
 * @throws The last error encountered if all retry attempts fail
 *
 * @example
 * ```typescript
 * const result = await withExponentialBackoff(
 *   async () => await api.callModel(prompt),
 *   { maxRetries: 3, initialDelay: 2000 }
 * );
 * ```
 */
export async function withExponentialBackoff<T>(
	operation: () => Promise<T>,
	config: Partial<BackoffConfig> = {},
): Promise<T> {
	const finalConfig: BackoffConfig = { ...DEFAULT_BACKOFF_CONFIG, ...config };
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt === finalConfig.maxRetries || !isRetryableError(error)) {
				throw lastError;
			}

			const baseDelay = Math.min(
				finalConfig.initialDelay * Math.pow(finalConfig.multiplier, attempt),
				finalConfig.maxDelay,
			);

			const delay = finalConfig.jitter ? baseDelay * (0.75 + Math.random() * 0.5) : baseDelay;

			logger.warn(
				{
					attempt: attempt + 1,
					maxRetries: finalConfig.maxRetries,
					delayMs: Math.round(delay),
					error: lastError.message,
				},
				`Retrying operation after transient failure`,
			);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError ?? new Error("Operation failed with unknown error");
}

/**
 * Checks if an error is retryable (transient failure).
 *
 * Retryable errors include:
 * - HTTP 429 (rate limit exceeded)
 * - HTTP 500-599 (server errors)
 * - Network timeouts
 * - Connection errors
 *
 * Non-retryable errors include:
 * - HTTP 400-499 (client errors except 429)
 * - Authentication failures
 * - Validation errors
 *
 * @param error Error to check for retry eligibility
 *
 * @returns `true` if error is retryable, `false` otherwise
 */
function isRetryableError(error: unknown): boolean {
	if (error && typeof error === "object" && "status" in error) {
		const status = typeof error.status === "number" ? error.status : Number(error.status);

		if (status === 429) return true;
		else if (status >= 500 && status < 600) {
			return true;
		} else if (status >= 400 && status < 500) {
			return false;
		}
	}

	if (error instanceof Error) {
		const NETWORK_ERRORS = ["timeout", "econnrefused", "enotfound", "network", "socket", "connect"];
		const message = error.message.toLowerCase();

		if (NETWORK_ERRORS.some((pattern) => message.includes(pattern))) {
			return true;
		}
	}

	return false;
}
