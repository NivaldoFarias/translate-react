/**
 * @fileoverview
 *
 * Core rate limiting service for API request throttling.
 *
 * Provides unified rate limiting for GitHub and LLM API calls using the
 * Bottleneck library. Implements token bucket algorithm with configurable
 * burst capacity, request queuing, and comprehensive metrics tracking.
 *
 * @see {@link https://github.com/SGrondin/bottleneck|Bottleneck Documentation}
 */

import Bottleneck from "bottleneck";

import type { RateLimiterConfig, RateLimiterMetrics, ServiceType } from "./rate-limiter.types";

import { logger } from "@/utils/";

import {
	FREE_LLM_RATE_LIMITER_CONFIG,
	GITHUB_RATE_LIMITER_CONFIG,
	PAID_LLM_RATE_LIMITER_CONFIG,
} from "./rate-limiter.config";

/**
 * Service for rate limiting API requests across different providers.
 *
 * Uses token bucket algorithm to enforce rate limits while maximizing throughput.
 * Provides separate limiters for GitHub and LLM APIs with appropriate configurations.
 *
 * ### Features
 *
 * - Per-service rate limiting (GitHub, LLM)
 * - Token bucket with burst capacity
 * - Request queuing and prioritization
 * - Comprehensive metrics tracking
 * - Automatic retry on rate limit errors
 * - Graceful degradation
 *
 * @example
 * ```typescript
 * const rateLimiter = new RateLimiterService();
 *
 * // Wrap GitHub API calls
 * const repos = await rateLimiter.scheduleGitHub(
 *   () => octokit.repos.listForOrg({ org: 'facebook' })
 * );
 *
 * // Wrap LLM API calls
 * const translation = await rateLimiter.scheduleLLM(
 *   () => openai.chat.completions.create({ ... })
 * );
 * ```
 */
export class RateLimiterService {
	/** Rate limiter instance for GitHub API requests */
	private readonly githubLimiter: Bottleneck;

	/** Rate limiter instance for LLM API requests */
	private readonly llmLimiter: Bottleneck;

	/** Metrics tracking for GitHub API */
	private githubMetrics: RateLimiterMetrics = {
		totalRequests: 0,
		queuedRequests: 0,
		runningRequests: 0,
		failedRequests: 0,
		averageWaitTime: 0,
	};

	/** Metrics tracking for LLM API */
	private llmMetrics: RateLimiterMetrics = {
		totalRequests: 0,
		queuedRequests: 0,
		runningRequests: 0,
		failedRequests: 0,
		averageWaitTime: 0,
	};

	/**
	 * Creates a new rate limiter service instance.
	 *
	 * Initializes separate Bottleneck instances for GitHub and LLM APIs
	 * with appropriate configurations. Sets up event handlers for metrics
	 * tracking and logging.
	 *
	 * @param config Optional custom configuration overrides
	 * @param config.github Custom GitHub rate limiter configuration
	 * @param config.llm Custom LLM rate limiter configuration
	 * @param config.usePaidLLM Whether to use paid LLM tier configuration
	 *
	 * @example
	 * ```typescript
	 * // Use default configurations
	 * const rateLimiter = new RateLimiterService();
	 *
	 * // Use paid LLM tier
	 * const rateLimiter = new RateLimiterService({ usePaidLLM: true });
	 *
	 * // Custom configuration
	 * const rateLimiter = new RateLimiterService({
	 *   llm: { maxConcurrent: 2, minTime: 30000 }
	 * });
	 * ```
	 */
	constructor(config?: {
		github?: Partial<RateLimiterConfig>;
		llm?: Partial<RateLimiterConfig>;
		usePaidLLM?: boolean;
	}) {
		const githubConfig = { ...GITHUB_RATE_LIMITER_CONFIG, ...config?.github };
		const llmConfig = {
			...(config?.usePaidLLM ? PAID_LLM_RATE_LIMITER_CONFIG : FREE_LLM_RATE_LIMITER_CONFIG),
			...config?.llm,
		};

		this.githubLimiter = this.createLimiter("github", githubConfig);
		this.llmLimiter = this.createLimiter("llm", llmConfig);
	}

	/**
	 * Creates and configures a Bottleneck limiter instance.
	 *
	 * Sets up event handlers for metrics tracking, logging, and error handling.
	 *
	 * @param serviceType Type of service for logging context
	 * @param config Rate limiter configuration
	 *
	 * @returns Configured Bottleneck instance
	 */
	private createLimiter(serviceType: ServiceType, config: RateLimiterConfig): Bottleneck {
		const limiter = new Bottleneck({
			maxConcurrent: config.maxConcurrent,
			minTime: config.minTime,
			reservoir: config.reservoir,
			reservoirRefreshAmount: config.reservoirRefreshAmount,
			reservoirRefreshInterval: config.reservoirRefreshInterval,
			highWater: config.highWater,
			strategy: Bottleneck.strategy.LEAK,
		});

		const metrics = serviceType === "github" ? this.githubMetrics : this.llmMetrics;

		/** Track when requests are queued */
		limiter.on("queued", () => {
			metrics.queuedRequests++;

			if (config.debug) {
				logger.debug(
					{
						service: serviceType,
						queued: metrics.queuedRequests,
						running: metrics.runningRequests,
					},
					"Request queued",
				);
			}
		});

		/** Track when requests start executing */
		limiter.on("executing", () => {
			metrics.runningRequests++;
			metrics.queuedRequests = Math.max(0, metrics.queuedRequests - 1);

			if (config.debug) {
				logger.debug(
					{
						service: serviceType,
						running: metrics.runningRequests,
						queued: metrics.queuedRequests,
					},
					"Request executing",
				);
			}
		});

		/** Track when requests complete successfully */
		limiter.on("done", () => {
			metrics.runningRequests = Math.max(0, metrics.runningRequests - 1);
			metrics.totalRequests++;
			metrics.lastRequestTime = new Date();

			if (config.debug) {
				logger.debug(
					{
						service: serviceType,
						total: metrics.totalRequests,
						running: metrics.runningRequests,
					},
					"Request completed",
				);
			}
		});

		/** Track when requests fail */
		limiter.on("failed", (error: Error) => {
			metrics.failedRequests++;
			metrics.lastError = error.message;

			logger.warn(
				{
					service: serviceType,
					error: error.message,
					failed: metrics.failedRequests,
					total: metrics.totalRequests,
				},
				"Rate limited request failed",
			);
		});

		/** Warn when queue size exceeds high water mark */
		limiter.on("depleted", () => {
			logger.warn(
				{
					service: serviceType,
					queued: metrics.queuedRequests,
					highWater: config.highWater,
				},
				"Rate limiter queue depleted (high water mark reached)",
			);
		});

		logger.info(
			{
				service: serviceType,
				maxConcurrent: config.maxConcurrent,
				minTime: config.minTime,
				reservoir: config.reservoir,
			},
			"Rate limiter initialized",
		);

		return limiter;
	}

	/**
	 * Schedules a GitHub API request with rate limiting.
	 *
	 * Queues the request and executes it when rate limit allows.
	 * Automatically handles queueing and throttling.
	 *
	 * @param fn Function that performs the GitHub API request
	 * @param priority Optional priority (higher = executed sooner)
	 *
	 * @returns Promise resolving to the request result
	 *
	 * @example
	 * ```typescript
	 * const repos = await rateLimiter.scheduleGitHub(
	 *   () => octokit.repos.listForOrg({ org: 'facebook' }),
	 *   5 // High priority
	 * );
	 * ```
	 */
	public async scheduleGitHub<T>(fn: () => Promise<T>, priority?: number): Promise<T> {
		return this.githubLimiter.schedule({ priority }, fn);
	}

	/**
	 * Schedules an LLM API request with rate limiting.
	 *
	 * Queues the request and executes it when rate limit allows.
	 * Automatically handles queueing and throttling.
	 *
	 * @param fn Function that performs the LLM API request
	 * @param priority Optional priority (higher = executed sooner)
	 *
	 * @returns Promise resolving to the request result
	 *
	 * @example
	 * ```typescript
	 * const completion = await rateLimiter.scheduleLLM(
	 *   () => openai.chat.completions.create({
	 *     model: 'gpt-4',
	 *     messages: [{ role: 'user', content: 'Hello' }]
	 *   })
	 * );
	 * ```
	 */
	public async scheduleLLM<T>(fn: () => Promise<T>, priority?: number): Promise<T> {
		return this.llmLimiter.schedule({ priority }, fn);
	}

	/**
	 * Retrieves current metrics for a service.
	 *
	 * Provides insights into rate limiter behavior, queue status,
	 * and API usage patterns.
	 *
	 * @param service Service type to get metrics for
	 *
	 * @returns Current metrics snapshot
	 *
	 * @example
	 * ```typescript
	 * const metrics = rateLimiter.getMetrics('github');
	 * console.log(`Total requests: ${metrics.totalRequests}`);
	 * console.log(`Queued: ${metrics.queuedRequests}`);
	 * ```
	 */
	public getMetrics(service: ServiceType): Readonly<RateLimiterMetrics> {
		return service === "github" ? { ...this.githubMetrics } : { ...this.llmMetrics };
	}

	/**
	 * Clears all queued requests for a service.
	 *
	 * Useful for emergency shutdowns or when you want to abandon
	 * all pending requests.
	 *
	 * @param service Service type to clear queue for
	 *
	 * @example
	 * ```typescript
	 * // Clear GitHub queue
	 * rateLimiter.clearQueue('github');
	 * ```
	 */
	public clearQueue(service: ServiceType): void {
		const limiter = service === "github" ? this.githubLimiter : this.llmLimiter;
		const metrics = service === "github" ? this.githubMetrics : this.llmMetrics;

		const queuedCount = metrics.queuedRequests;

		// Clear all jobs from the queue
		limiter.stop({ dropWaitingJobs: true });

		logger.warn(
			{
				service,
				clearedJobs: queuedCount,
			},
			"Rate limiter queue cleared",
		);

		// Reset metrics
		metrics.queuedRequests = 0;
	}

	/**
	 * Gracefully shuts down all rate limiters.
	 *
	 * Waits for running requests to complete but drops queued requests.
	 * Should be called during application shutdown.
	 *
	 * @example
	 * ```typescript
	 * process.on('SIGTERM', async () => {
	 *   await rateLimiter.shutdown();
	 *   process.exit(0);
	 * });
	 * ```
	 */
	public async shutdown(): Promise<void> {
		logger.info("Shutting down rate limiters...");

		await Promise.all([
			this.githubLimiter.stop({ dropWaitingJobs: true }),
			this.llmLimiter.stop({ dropWaitingJobs: true }),
		]);

		logger.info(
			{
				githubMetrics: this.githubMetrics,
				llmMetrics: this.llmMetrics,
			},
			"Rate limiters shut down",
		);
	}
}
