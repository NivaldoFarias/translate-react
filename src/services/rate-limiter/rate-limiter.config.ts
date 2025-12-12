import type { RateLimiterConfig, RateLimiterMetrics } from "./rate-limiter.types";

export const DEFAULT_RATE_LIMITER_METRICS: RateLimiterMetrics = {
	totalRequests: 0,
	queuedRequests: 0,
	runningRequests: 0,
	failedRequests: 0,
	averageWaitTime: 0,
};

/**
 * Preset rate limiter configurations for common services.
 *
 * Import and use these presets to quickly configure rate limiters
 * with sensible defaults for well-known APIs.
 *
 * @example
 * ```typescript
 * import { PRESETS } from '@/services/rate-limiter/rate-limiter.presets';
 *
 * const rateLimiter = new RateLimiterService({
 *   github: PRESETS.githubAPI,
 *   llm: PRESETS.freeLLM
 * });
 * ```
 */
export const CONFIGS = {
	/**
	 * GitHub API rate limiter configuration.
	 *
	 * GitHub allows 5000 requests/hour for authenticated users:
	 * - 5000 req/hour ≈ 83 req/minute ≈ 1.4 req/second
	 * - Safe rate: ~1.2 req/second (720ms between requests)
	 * - Allows small burst capacity (5 requests) for efficiency
	 * - 10 concurrent requests to maximize throughput
	 *
	 * @see {@link https://docs.github.com/en/rest/overview/rate-limits-for-the-rest-api|GitHub Rate Limits}
	 */
	githubAPI: {
		maxConcurrent: 10,
		minTime: 720,
		reservoir: 5,
		reservoirRefreshAmount: 1,
		reservoirRefreshInterval: 720,
		highWater: 100,
		debug: false,
	} satisfies RateLimiterConfig,

	/**
	 * Free-tier LLM API rate limiter configuration.
	 *
	 * Free models typically have strict limits:
	 * - OpenRouter free tier: ~1-2 requests/minute
	 * - Enforces sequential execution (maxConcurrent: 1)
	 * - No burst capacity (reservoir: 1)
	 * - 60 second minimum between requests for safety
	 *
	 * @see {@link https://openrouter.ai/docs/limits|OpenRouter Rate Limits}
	 */
	freeLLM: {
		maxConcurrent: 1,
		minTime: 60_000,
		reservoir: 1,
		reservoirRefreshAmount: 1,
		reservoirRefreshInterval: 60_000,
		highWater: 50,
		debug: false,
	} satisfies RateLimiterConfig,

	/**
	 * Paid-tier LLM API rate limiter configuration.
	 *
	 * Paid tiers have more generous limits:
	 * - Typically 60-500 requests/minute depending on tier
	 * - Allows modest concurrency (3 requests)
	 * - Small burst capacity (10 requests)
	 * - 1 second minimum between requests
	 *
	 * Adjust based on your specific provider and tier.
	 */
	paidLLM: {
		maxConcurrent: 3,
		minTime: 1000,
		reservoir: 10,
		reservoirRefreshAmount: 1,
		reservoirRefreshInterval: 1000,
		highWater: 100,
		debug: false,
	} satisfies RateLimiterConfig,
} as const satisfies Record<string, RateLimiterConfig>;
