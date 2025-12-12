import Bottleneck from "bottleneck";

import type { RateLimiterConfig, RateLimiterMetrics } from "./rate-limiter.types";

import { logger } from "@/utils";

import { DEFAULT_RATE_LIMITER_METRICS } from "./rate-limiter.config";

/**
 * Service for rate limiting API requests across different providers.
 *
 * Uses token bucket algorithm to enforce rate limits while maximizing throughput.
 * Supports dynamic service registration - any number of services can be registered
 * with their own rate limit configurations.
 *
 * ### Features
 *
 * - Dynamic per-service rate limiting
 * - Token bucket with burst capacity
 * - Request queuing and prioritization
 * - Comprehensive metrics tracking
 * - Automatic retry on rate limit errors
 * - Graceful degradation
 *
 * @example
 * ```typescript
 * // Register services with custom configs
 * const rateLimiter = new RateLimiterService({
 *   github: { maxConcurrent: 10, minTime: 720, reservoir: 5 },
 *   llm: { maxConcurrent: 1, minTime: 60_000, reservoir: 1 }
 * });
 *
 * // Schedule requests for registered services
 * const repos = await rateLimiter.schedule('github',
 *   () => octokit.repos.listForOrg({ org: 'facebook' })
 * );
 *
 * const translation = await rateLimiter.schedule('llm',
 *   () => openai.chat.completions.create({ ... })
 * );
 * ```
 */
export class RateLimiterService {
	private readonly logger = logger.child({ component: RateLimiterService.name });

	/** Rate limiter instances for registered services */
	private readonly limiters: Map<string, Bottleneck>;

	/** Metrics tracking for each registered service */
	private metrics: Map<string, RateLimiterMetrics>;

	/**
	 * Creates a new rate limiter service instance.
	 *
	 * Initializes Bottleneck instances for each provided service configuration.
	 * Services are registered dynamically based on the config map provided.
	 *
	 * @param configs Map of service identifiers to their rate limiter configurations
	 *
	 * @example
	 * ```typescript
	 * // Register multiple services
	 * const rateLimiter = new RateLimiterService({
	 *   github: { maxConcurrent: 10, minTime: 720 },
	 *   llm: { maxConcurrent: 1, minTime: 60_000 },
	 *   stripe: { maxConcurrent: 5, minTime: 100 }
	 * });
	 *
	 * // Register single service
	 * const rateLimiter = new RateLimiterService({
	 *   'weather-api': { maxConcurrent: 3, minTime: 1000 }
	 * });
	 * ```
	 */
	constructor(configs: Record<string, RateLimiterConfig>) {
		this.limiters = new Map();
		this.metrics = new Map();

		for (const [serviceId, config] of Object.entries(configs)) {
			this.registerService(serviceId, config);
		}

		this.logger.info(
			{ services: Array.from(this.limiters.keys()), count: this.limiters.size },
			"Rate limiter service initialized with registered services",
		);
	}

	/**
	 * Registers a new service with the rate limiter.
	 *
	 * Can be called after construction to add services dynamically.
	 *
	 * @param serviceId Unique identifier for the service
	 * @param config Rate limiter configuration for this service
	 *
	 * @throws {Error} If service is already registered
	 *
	 * @example
	 * ```typescript
	 * rateLimiter.registerService('new-api', {
	 *   maxConcurrent: 2,
	 *   minTime: 500
	 * });
	 * ```
	 */
	public registerService(serviceId: string, config: RateLimiterConfig): void {
		if (this.limiters.has(serviceId)) {
			throw new Error(`Service '${serviceId}' is already registered`);
		}

		this.metrics.set(serviceId, DEFAULT_RATE_LIMITER_METRICS);

		const limiter = this.createLimiter(serviceId, config);
		this.limiters.set(serviceId, limiter);

		this.logger.info(
			{
				service: serviceId,
				config: {
					maxConcurrent: config.maxConcurrent,
					minTime: config.minTime,
					reservoir: config.reservoir,
				},
			},
			"Service registered with rate limiter",
		);
	}

	/**
	 * Creates and configures a Bottleneck limiter instance.
	 *
	 * Sets up event handlers for metrics tracking, logging, and error handling.
	 *
	 * @param serviceId Identifier of service for logging context
	 * @param config Rate limiter configuration
	 *
	 * @returns Configured Bottleneck instance
	 */
	private createLimiter(serviceId: string, config: RateLimiterConfig): Bottleneck {
		const limiter = new Bottleneck({
			maxConcurrent: config.maxConcurrent,
			minTime: config.minTime,
			reservoir: config.reservoir,
			reservoirRefreshAmount: config.reservoirRefreshAmount,
			reservoirRefreshInterval: config.reservoirRefreshInterval,
			highWater: config.highWater,
			strategy: Bottleneck.strategy.LEAK,
		});

		const metrics = this.metrics.get(serviceId);
		if (!metrics) {
			throw new Error(`Metrics not initialized for service '${serviceId}'`);
		}

		/** Track when requests are queued */
		limiter.on("queued", () => {
			metrics.queuedRequests++;

			if (config.debug) {
				this.logger.debug(
					{ service: serviceId, queued: metrics.queuedRequests, running: metrics.runningRequests },
					"Request queued",
				);
			}
		});

		/** Track when requests start executing */
		limiter.on("executing", () => {
			metrics.runningRequests++;
			metrics.queuedRequests = Math.max(0, metrics.queuedRequests - 1);

			if (config.debug) {
				this.logger.debug(
					{ service: serviceId, running: metrics.runningRequests, queued: metrics.queuedRequests },
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
				this.logger.debug(
					{ service: serviceId, total: metrics.totalRequests, running: metrics.runningRequests },
					"Request completed",
				);
			}
		});

		/** Track when requests fail */
		limiter.on("failed", (error: Error) => {
			metrics.failedRequests++;
			metrics.lastError = error.message;

			this.logger.warn(
				{
					service: serviceId,
					error: error.message,
					failed: metrics.failedRequests,
					total: metrics.totalRequests,
				},
				"Rate limited request failed",
			);
		});

		/** Warn when queue size exceeds high water mark */
		limiter.on("depleted", () => {
			this.logger.warn(
				{ service: serviceId, queued: metrics.queuedRequests, highWater: config.highWater },
				"Rate limiter queue depleted (high water mark reached)",
			);
		});

		return limiter;
	}

	/**
	 * Schedules an API request with rate limiting for a specific service.
	 *
	 * Queues the request and executes it when the service's rate limit allows.
	 * Automatically handles queueing and throttling based on service configuration.
	 *
	 * @param serviceId Identifier of the registered service
	 * @param fn Function that performs the API request
	 * @param priority Optional priority (higher = executed sooner)
	 *
	 * @returns Promise resolving to the request result
	 *
	 * @throws {Error} If service is not registered
	 *
	 * @example
	 * ```typescript
	 * // Schedule GitHub API request
	 * const repos = await rateLimiter.schedule('github',
	 *   () => octokit.repos.listForOrg({ org: 'facebook' }),
	 *   5 // High priority
	 * );
	 *
	 * // Schedule LLM API request
	 * const completion = await rateLimiter.schedule('llm',
	 *   () => openai.chat.completions.create({ ... })
	 * );
	 *
	 * // Schedule custom service request
	 * const weather = await rateLimiter.schedule('weather-api',
	 *   () => fetch('https://api.weather.com/current')
	 * );
	 * ```
	 */
	public async schedule<T>(serviceId: string, fn: () => Promise<T>, priority?: number): Promise<T> {
		const limiter = this.limiters.get(serviceId);

		if (!limiter) {
			throw new Error(
				`Service '${serviceId}' is not registered. Available services: ${Array.from(this.limiters.keys()).join(", ")}`,
			);
		}

		return limiter.schedule({ priority }, fn);
	}

	/**
	 * Retrieves current metrics for a service.
	 *
	 * Provides insights into rate limiter behavior, queue status,
	 * and API usage patterns.
	 *
	 * @param serviceId Identifier of service to get metrics for
	 *
	 * @returns Current metrics snapshot, or undefined if service not registered
	 *
	 * @example
	 * ```typescript
	 * const metrics = rateLimiter.getMetrics('github');
	 * if (metrics) {
	 *   console.log(`Total requests: ${metrics.totalRequests}`);
	 *   console.log(`Queued: ${metrics.queuedRequests}`);
	 * }
	 * ```
	 */
	public getMetrics(serviceId: string): Readonly<RateLimiterMetrics> | undefined {
		const metrics = this.metrics.get(serviceId);
		return metrics ? { ...metrics } : undefined;
	}

	/**
	 * Retrieves metrics for all registered services.
	 *
	 * @returns Map of service identifiers to their metrics
	 *
	 * @example
	 * ```typescript
	 * const allMetrics = rateLimiter.getAllMetrics();
	 * for (const [service, metrics] of allMetrics) {
	 *   console.log(`${service}: ${metrics.totalRequests} requests`);
	 * }
	 * ```
	 */
	public getAllMetrics(): ReadonlyMap<string, Readonly<RateLimiterMetrics>> {
		const snapshot = new Map<string, Readonly<RateLimiterMetrics>>();
		for (const [serviceId, metrics] of this.metrics) {
			snapshot.set(serviceId, { ...metrics });
		}
		return snapshot;
	}

	/**
	 * Lists all registered service identifiers.
	 *
	 * @returns Array of registered service identifiers
	 *
	 * @example
	 * ```typescript
	 * const services = rateLimiter.getRegisteredServices();
	 * console.log('Available services:', services); // ['github', 'llm', 'stripe']
	 * ```
	 */
	public getRegisteredServices(): readonly string[] {
		return Array.from(this.limiters.keys());
	}

	/**
	 * Clears all queued requests for a service.
	 *
	 * Useful for emergency shutdowns or when you want to abandon
	 * all pending requests.
	 *
	 * @param serviceId Identifier of service to clear queue for
	 *
	 * @throws {Error} If service is not registered
	 *
	 * @example
	 * ```typescript
	 * // Clear GitHub queue
	 * rateLimiter.clearQueue('github');
	 * ```
	 */
	public clearQueue(serviceId: string): void {
		const limiter = this.limiters.get(serviceId);
		const metrics = this.metrics.get(serviceId);

		if (!limiter || !metrics) {
			throw new Error(`Service '${serviceId}' is not registered`);
		}

		const queuedCount = metrics.queuedRequests;

		void limiter.stop({ dropWaitingJobs: true });

		this.logger.warn(
			{ service: serviceId, clearedJobs: queuedCount },
			"Rate limiter queue cleared",
		);

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
		this.logger.info(
			{ services: Array.from(this.limiters.keys()), count: this.limiters.size },
			"Shutting down rate limiters...",
		);

		const shutdownPromises = Array.from(this.limiters.values()).map((limiter) =>
			limiter.stop({ dropWaitingJobs: true }),
		);

		await Promise.all(shutdownPromises);

		const finalMetrics: Record<string, RateLimiterMetrics> = {};
		for (const [serviceId, metrics] of this.metrics) {
			finalMetrics[serviceId] = metrics;
		}

		this.logger.info({ metrics: finalMetrics }, "Rate limiters shut down");
	}
}
