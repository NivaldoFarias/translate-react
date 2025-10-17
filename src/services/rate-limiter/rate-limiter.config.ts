/**
 * @fileoverview
 *
 * Configuration presets for rate limiting different API services.
 *
 * Provides battle-tested configurations for GitHub API and various LLM providers
 * based on documented rate limits and real-world usage patterns.
 */

import type { RateLimiterConfig } from "./rate-limiter.types";

/**
 * Rate limiter configuration for GitHub API.
 *
 * GitHub allows 5000 requests/hour for authenticated users:
 * - 5000 req/hour ≈ 83 req/minute ≈ 1.4 req/second
 * - Safe rate: ~1.2 req/second (720ms between requests)
 * - Allows small burst capacity (5 requests) for efficiency
 * - 10 concurrent requests to maximize throughput
 *
 * @see {@link https://docs.github.com/en/rest/overview/rate-limits-for-the-rest-api|GitHub Rate Limits}
 */
export const GITHUB_RATE_LIMITER_CONFIG: RateLimiterConfig = {
	maxConcurrent: 10,
	minTime: 720, // ~720ms between requests (safe margin below 1.4/sec)
	reservoir: 5, // Allow small burst
	reservoirRefreshAmount: 1,
	reservoirRefreshInterval: 720,
	highWater: 100,
	debug: false,
};

/**
 * Rate limiter configuration for free-tier LLM models.
 *
 * Free models typically have strict limits:
 * - OpenRouter free tier: ~1-2 requests/minute
 * - Enforces sequential execution (maxConcurrent: 1)
 * - No burst capacity (reservoir: 1)
 * - 60 second minimum between requests for safety
 *
 * @see {@link https://openrouter.ai/docs/limits|OpenRouter Rate Limits}
 */
export const FREE_LLM_RATE_LIMITER_CONFIG: RateLimiterConfig = {
	maxConcurrent: 1, // Sequential only
	minTime: 60_000, // 60 seconds between requests
	reservoir: 1, // No burst capacity
	reservoirRefreshAmount: 1,
	reservoirRefreshInterval: 60_000, // Refill every 60 seconds
	highWater: 50,
	debug: false,
};

/**
 * Rate limiter configuration for paid-tier LLM models.
 *
 * Paid tiers have more generous limits:
 * - Typically 60-500 requests/minute depending on tier
 * - Allows modest concurrency (3 requests)
 * - Small burst capacity (10 requests)
 * - 1 second minimum between requests
 *
 * Adjust based on your specific provider and tier.
 */
export const PAID_LLM_RATE_LIMITER_CONFIG: RateLimiterConfig = {
	maxConcurrent: 3,
	minTime: 1000, // 1 second between requests
	reservoir: 10,
	reservoirRefreshAmount: 1,
	reservoirRefreshInterval: 1000,
	highWater: 100,
	debug: false,
};
