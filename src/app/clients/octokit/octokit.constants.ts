import type { Options as RetryOptions } from "p-retry";

/** Buffer time added to rate limit reset time to avoid edge cases (1 second) */
export const RATE_LIMIT_BUFFER_MS = 1_000;

/** Maximum time to wait for rate limit reset (5 minutes) */
export const RATE_LIMIT_MAX_DELAY_MS = 300_000;

/** Network error patterns that indicate retryable transient failures */
export const NETWORK_ERROR_PATTERNS = [
	"ECONNRESET",
	"ETIMEDOUT",
	"ENOTFOUND",
	"ECONNREFUSED",
	"EAI_AGAIN",
] as const;

/** Default retry configuration for GitHub API calls */
export const DEFAULT_RETRY_CONFIG: RetryOptions = {
	retries: 3,
	minTimeout: 1_000,
	maxTimeout: 10_000,
	factor: 2,
};
