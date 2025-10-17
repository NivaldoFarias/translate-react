/**
 * @fileoverview
 *
 * Type definitions for rate limiting functionality.
 *
 * Provides configuration interfaces and types for rate limiting across
 * different API services (GitHub, LLM providers).
 */

/**
 * Supported API service types for rate limiting.
 *
 * Each service type has different rate limit requirements:
 * - `github`: GitHub API (5000 requests/hour for authenticated users)
 * - `llm`: Language model providers (varies by provider and tier)
 */
export type ServiceType = "github" | "llm";

/**
 * Configuration for rate limiter behavior.
 *
 * Follows token bucket algorithm with configurable reservoir and refill rates.
 * Designed to prevent rate limit errors while maximizing throughput.
 */
export interface RateLimiterConfig {
	/**
	 * Maximum number of concurrent requests allowed.
	 *
	 * Prevents overwhelming the API with parallel requests.
	 *
	 * @example 1 // For free LLM models (sequential only)
	 * @example 10 // For GitHub API (allows parallelism)
	 */
	maxConcurrent: number;

	/**
	 * Minimum time (in milliseconds) between consecutive requests.
	 *
	 * Enforces spacing between requests to comply with rate limits.
	 *
	 * @example 60000 // 1 minute for free LLM models (1 req/min)
	 * @example 720 // ~720ms for GitHub (5000 req/hour = ~1.4 req/sec)
	 */
	minTime: number;

	/**
	 * Maximum number of requests in the reservoir (token bucket).
	 *
	 * The reservoir starts full and depletes with each request.
	 * Provides burst capacity for short periods.
	 *
	 * @example 5 // Allow small burst for GitHub
	 * @example 1 // No burst for free LLM models
	 */
	reservoir?: number;

	/**
	 * Number of requests to add back to reservoir per interval.
	 *
	 * Controls the refill rate of the token bucket.
	 *
	 * @example 1 // Add 1 token per interval
	 */
	reservoirRefreshAmount?: number;

	/**
	 * Time (in milliseconds) between reservoir refills.
	 *
	 * Combined with `reservoirRefreshAmount` to control sustained rate.
	 *
	 * @example 60000 // Refill every minute for free LLM models
	 * @example 720 // Refill every ~720ms for GitHub
	 */
	reservoirRefreshInterval?: number;

	/**
	 * High water mark for queue size warnings.
	 *
	 * When queue exceeds this size, warnings are logged.
	 *
	 * @default 100
	 */
	highWater?: number;

	/**
	 * Whether to enable detailed debug logging for rate limiter events.
	 *
	 * @default false
	 */
	debug?: boolean;
}

/**
 * Metrics tracked by the rate limiter for observability.
 *
 * Provides insights into rate limiter behavior and API usage patterns.
 */
export interface RateLimiterMetrics {
	/** Total number of requests executed */
	totalRequests: number;

	/** Number of requests currently queued */
	queuedRequests: number;

	/** Number of requests currently executing */
	runningRequests: number;

	/** Number of requests that failed */
	failedRequests: number;

	/** Average wait time in queue (milliseconds) */
	averageWaitTime: number;

	/** Last error encountered (if any) */
	lastError?: string;

	/** Timestamp of last request execution */
	lastRequestTime?: Date;
}
