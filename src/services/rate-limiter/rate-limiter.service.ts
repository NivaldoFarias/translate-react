import Bottleneck from "bottleneck";

import type { RateLimiterConfig, RateLimiterMetrics } from "./rate-limiter.types";

import { logger } from "@/utils";

import { CONFIGS } from "./rate-limiter.config";

/**
 * Rate limiter for a single API service.
 *
 * Wraps Bottleneck with centralized event listener setup, metrics tracking,
 * and logging. Each instance manages rate limiting for one specific API.
 *
 * ### Features
 *
 * - Token bucket algorithm with burst capacity
 * - Request queuing and prioritization
 * - Comprehensive metrics tracking
 * - Automatic error handling
 * - Graceful shutdown
 *
 * @example
 * ```typescript
 * import { githubRateLimiter, llmRateLimiter } from '@/services/rate-limiter';
 *
 * // Schedule GitHub API request
 * const repos = await githubRateLimiter.schedule(
 *   () => octokit.repos.listForOrg({ org: 'facebook' })
 * );
 *
 * // Schedule LLM API request with priority
 * const completion = await llmRateLimiter.schedule(
 *   () => openai.chat.completions.create({ ... }),
 *   5
 * );
 * ```
 */
export class RateLimiter {
	private readonly logger = logger.child({ component: RateLimiter.name });

	/** Bottleneck rate limiter instance */
	private readonly limiter: Bottleneck;

	/** Metrics tracking for this rate limiter */
	private readonly metrics: RateLimiterMetrics;

	/** Identifier for logging context */
	private readonly name: string;

	/** Tracks whether shutdown has been called */
	private isShutdown = false;

	/**
	 * Creates a new rate limiter instance.
	 *
	 * Initializes Bottleneck with the provided configuration and sets up
	 * event handlers for metrics tracking, logging, and error handling.
	 *
	 * @param config Rate limiter configuration
	 * @param name Identifier for logging and metrics context
	 *
	 * @example
	 * ```typescript
	 * const limiter = new RateLimiter(CONFIGS.githubAPI, 'github');
	 * ```
	 */
	constructor(config: RateLimiterConfig, name: string) {
		this.name = name;
		this.metrics = {
			totalRequests: 0,
			queuedRequests: 0,
			runningRequests: 0,
			failedRequests: 0,
			averageWaitTime: 0,
		};

		this.limiter = this.createLimiter(config);

		this.logger.info(
			{
				name: this.name,
				config: {
					maxConcurrent: config.maxConcurrent,
					minTime: config.minTime,
					reservoir: config.reservoir,
				},
			},
			"Rate limiter initialized",
		);
	}

	/**
	 * Creates and configures a Bottleneck limiter instance.
	 *
	 * Sets up event handlers for metrics tracking, logging, and error handling.
	 * All event listener setup is centralized here to ensure consistent behavior.
	 *
	 * @param config Rate limiter configuration
	 *
	 * @returns Configured Bottleneck instance
	 */
	private createLimiter(config: RateLimiterConfig): Bottleneck {
		const limiter = new Bottleneck({ ...config, strategy: Bottleneck.strategy.LEAK });

		/** Track when requests are queued */
		limiter.on("queued", () => {
			this.metrics.queuedRequests++;

			if (config.debug) {
				this.logger.debug(
					{
						name: this.name,
						queued: this.metrics.queuedRequests,
						running: this.metrics.runningRequests,
					},
					"Request queued",
				);
			}
		});

		/** Track when requests start executing */
		limiter.on("executing", () => {
			this.metrics.runningRequests++;
			this.metrics.queuedRequests = Math.max(0, this.metrics.queuedRequests - 1);

			if (config.debug) {
				this.logger.debug(
					{
						name: this.name,
						running: this.metrics.runningRequests,
						queued: this.metrics.queuedRequests,
					},
					"Request executing",
				);
			}
		});

		/** Track when requests complete successfully */
		limiter.on("done", () => {
			this.metrics.runningRequests = Math.max(0, this.metrics.runningRequests - 1);
			this.metrics.totalRequests++;
			this.metrics.lastRequestTime = new Date();

			if (config.debug) {
				this.logger.debug(
					{
						name: this.name,
						total: this.metrics.totalRequests,
						running: this.metrics.runningRequests,
					},
					"Request completed",
				);
			}
		});

		/** Track when requests fail */
		limiter.on("failed", (error: Error) => {
			this.metrics.failedRequests++;
			this.metrics.lastError = error.message;

			this.logger.warn(
				{
					name: this.name,
					error: error.message,
					failed: this.metrics.failedRequests,
					total: this.metrics.totalRequests,
				},
				"Rate limited request failed",
			);
		});

		/** Warn when queue size exceeds high water mark */
		limiter.on("depleted", () => {
			this.logger.warn(
				{ name: this.name, queued: this.metrics.queuedRequests, highWater: config.highWater },
				"Rate limiter queue depleted (high water mark reached)",
			);
		});

		return limiter;
	}

	/**
	 * Schedules an API request with rate limiting.
	 *
	 * Queues the request and executes it when the rate limit allows.
	 * Automatically handles queueing and throttling based on configuration.
	 *
	 * @param fn Function that performs the API request
	 * @param priority Optional priority (higher = executed sooner)
	 *
	 * @returns Promise resolving to the request result
	 *
	 * @example
	 * ```typescript
	 * // Schedule request
	 * const repos = await githubRateLimiter.schedule(
	 *   () => octokit.repos.listForOrg({ org: 'facebook' })
	 * );
	 *
	 * // Schedule with priority
	 * const completion = await llmRateLimiter.schedule(
	 *   () => openai.chat.completions.create({ ... }),
	 *   5
	 * );
	 * ```
	 */
	public async schedule<T>(fn: () => Promise<T>, priority?: number): Promise<T> {
		return this.limiter.schedule({ priority }, fn);
	}

	/**
	 * Retrieves current metrics snapshot.
	 *
	 * Provides insights into rate limiter behavior, queue status,
	 * and API usage patterns.
	 *
	 * @returns Current metrics snapshot
	 *
	 * @example
	 * ```typescript
	 * const metrics = githubRateLimiter.getMetrics();
	 * console.log(`Total requests: ${metrics.totalRequests}`);
	 * console.log(`Queued: ${metrics.queuedRequests}`);
	 * ```
	 */
	public getMetrics(): Readonly<RateLimiterMetrics> {
		return { ...this.metrics };
	}

	/**
	 * Clears all queued requests.
	 *
	 * Useful for emergency shutdowns or when you want to abandon
	 * all pending requests. Note: This effectively stops the limiter.
	 *
	 * @example
	 * ```typescript
	 * githubRateLimiter.clearQueue();
	 * ```
	 */
	public clearQueue(): void {
		if (this.isShutdown) {
			this.logger.debug({ name: this.name }, "Rate limiter already shut down, cannot clear queue");
			return;
		}

		const queuedCount = this.metrics.queuedRequests;

		void this.limiter.stop({ dropWaitingJobs: true });
		this.isShutdown = true;

		this.logger.warn({ name: this.name, clearedJobs: queuedCount }, "Rate limiter queue cleared");

		this.metrics.queuedRequests = 0;
	}

	/**
	 * Gracefully shuts down the rate limiter.
	 *
	 * Waits for running requests to complete but drops queued requests.
	 * Should be called during application shutdown. Safe to call multiple times.
	 *
	 * @param dropWaitingJobs Whether to drop waiting jobs (default: true)
	 *
	 * @example
	 * ```typescript
	 * process.on('SIGTERM', async () => {
	 *   await githubRateLimiter.shutdown();
	 *   process.exit(0);
	 * });
	 * ```
	 */
	public async shutdown(dropWaitingJobs = true): Promise<void> {
		if (this.isShutdown) {
			this.logger.debug({ name: this.name }, "Rate limiter already shut down, skipping");
			return;
		}

		this.isShutdown = true;
		this.logger.info({ name: this.name }, "Shutting down rate limiter...");

		await this.limiter.stop({ dropWaitingJobs });

		this.logger.info({ name: this.name, metrics: this.metrics }, "Rate limiter shut down");
	}
}

/**
 * Creates a new rate limiter instance.
 *
 * Factory function for creating rate limiters with custom configurations.
 * Useful for testing or creating additional rate limiters at runtime.
 *
 * @param config Rate limiter configuration
 * @param name Identifier for logging and metrics context
 *
 * @returns New RateLimiter instance
 *
 * @example
 * ```typescript
 * // For testing
 * const testLimiter = createRateLimiter(CONFIGS.githubAPI, 'test-github');
 * ```
 */
export function createRateLimiter(config: RateLimiterConfig, name: string): RateLimiter {
	return new RateLimiter(config, name);
}

/**
 * Singleton rate limiter instance for GitHub API requests.
 *
 * Pre-configured with GitHub API rate limits (5000 requests/hour).
 * Use this instance across the entire application for GitHub API calls.
 *
 * @example
 * ```typescript
 * import { githubRateLimiter } from '@/services/rate-limiter';
 *
 * const repos = await githubRateLimiter.schedule(
 *   () => octokit.repos.listForOrg({ org: 'facebook' })
 * );
 * ```
 */
export const githubRateLimiter = new RateLimiter(CONFIGS.githubAPI, "github");

/**
 * Singleton rate limiter instance for LLM API requests (free tier).
 *
 * Pre-configured with free tier LLM rate limits (1-2 requests/minute).
 * Use this instance across the entire application for LLM API calls.
 *
 * @example
 * ```typescript
 * import { llmRateLimiter } from '@/services/rate-limiter';
 *
 * const completion = await llmRateLimiter.schedule(
 *   () => openai.chat.completions.create({ ... })
 * );
 * ```
 */
export const llmRateLimiter = new RateLimiter(CONFIGS.freeLLM, "llm");
