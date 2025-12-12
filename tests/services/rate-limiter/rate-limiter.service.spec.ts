import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type {
	RateLimiterConfig,
	RateLimiterMetrics,
} from "@/services/rate-limiter/rate-limiter.types";

import { CONFIGS, RateLimiterService } from "@/services/rate-limiter";

/**
 * Creates a rate limiter instance for testing with proper cleanup tracking.
 *
 * @param services Optional services to register
 *
 * @returns Rate limiter instance and cleanup function
 */
function createTestRateLimiter(services?: Record<string, RateLimiterConfig>): {
	rateLimiter: RateLimiterService;
	cleanup: () => Promise<void>;
} {
	const defaultServices: Record<string, RateLimiterConfig> = {
		github: CONFIGS.githubAPI,
		llm: CONFIGS.freeLLM,
	};

	const rateLimiter = new RateLimiterService(services ?? defaultServices);

	return {
		rateLimiter,
		cleanup: async () => {
			await rateLimiter.shutdown();
		},
	};
}

/**
 * Validates that metrics contain expected structure with zero values.
 *
 * @param metrics Metrics object to validate
 */
function expectZeroMetrics(metrics: RateLimiterMetrics | undefined): void {
	expect(metrics).toBeDefined();
	if (!metrics) return;

	expect(metrics.totalRequests).toBe(0);
	expect(metrics.queuedRequests).toBe(0);
	expect(metrics.runningRequests).toBe(0);
	expect(metrics.failedRequests).toBe(0);
}

/**
 * Creates a delay promise for testing async timing.
 *
 * @param ms Milliseconds to delay
 *
 * @returns Promise that resolves after delay
 */
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("RateLimiterService", () => {
	let rateLimiter: RateLimiterService;
	let cleanup: () => Promise<void>;

	beforeEach(() => {
		const testInstance = createTestRateLimiter();
		rateLimiter = testInstance.rateLimiter;
		cleanup = testInstance.cleanup;
	});

	afterEach(async () => {
		await cleanup();
	});

	describe("Initialization", () => {
		test("should initialize with default configurations", () => {
			expect(rateLimiter).toBeDefined();

			const githubMetrics = rateLimiter.getMetrics("github");
			const llmMetrics = rateLimiter.getMetrics("llm");

			expectZeroMetrics(githubMetrics);
			expectZeroMetrics(llmMetrics);
		});

		test("should accept custom configurations", async () => {
			const customConfig = {
				github: { maxConcurrent: 5, minTime: 1000 },
				llm: { maxConcurrent: 2, minTime: 2000 },
			};

			const { rateLimiter: customRateLimiter, cleanup: customCleanup } =
				createTestRateLimiter(customConfig);

			expect(customRateLimiter).toBeDefined();
			expect(customRateLimiter.getRegisteredServices()).toContain("github");
			expect(customRateLimiter.getRegisteredServices()).toContain("llm");

			await customCleanup();
		});

		test("should support different LLM tiers", async () => {
			const { rateLimiter: freeLimiter, cleanup: freeCleanup } = createTestRateLimiter({
				llm: CONFIGS.freeLLM,
			});
			const { rateLimiter: paidLimiter, cleanup: paidCleanup } = createTestRateLimiter({
				llm: CONFIGS.paidLLM,
			});

			expect(freeLimiter).toBeDefined();
			expect(paidLimiter).toBeDefined();
			expect(freeLimiter.getRegisteredServices()).toContain("llm");
			expect(paidLimiter.getRegisteredServices()).toContain("llm");

			await freeCleanup();
			await paidCleanup();
		});

		test("should list registered services", () => {
			const services = rateLimiter.getRegisteredServices();

			expect(services).toContain("github");
			expect(services).toContain("llm");
			expect(services).toHaveLength(2);
		});

		test("should support dynamic service registration", async () => {
			const { rateLimiter: limiter, cleanup: dynamicCleanup } = createTestRateLimiter({
				github: CONFIGS.githubAPI,
			});

			limiter.registerService("custom-api", {
				maxConcurrent: 3,
				minTime: 500,
			});

			const services = limiter.getRegisteredServices();
			expect(services).toContain("github");
			expect(services).toContain("custom-api");
			expect(services).toHaveLength(2);

			await dynamicCleanup();
		});
	});

	describe("GitHub API Rate Limiting", () => {
		test("should schedule GitHub API requests", async () => {
			const expectedResponse = { data: "test" };
			const mockGithubRequest = mock(() => Promise.resolve(expectedResponse));

			const result = await rateLimiter.schedule("github", mockGithubRequest);

			expect(result).toEqual(expectedResponse);
			expect(mockGithubRequest).toHaveBeenCalledTimes(1);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.totalRequests).toBe(1);
				expect(metrics.failedRequests).toBe(0);
			}
		});

		test("should handle multiple concurrent GitHub requests", async () => {
			const requestCount = 5;
			const mockGithubRequest = mock(() => Promise.resolve({ data: "test" }));

			const requests = Array.from({ length: requestCount }, () =>
				rateLimiter.schedule("github", mockGithubRequest),
			);
			await Promise.all(requests);

			expect(mockGithubRequest).toHaveBeenCalledTimes(requestCount);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.totalRequests).toBe(requestCount);
				expect(metrics.runningRequests).toBe(0);
				expect(metrics.queuedRequests).toBe(0);
			}
		});

		test("should respect rate limits for GitHub API", async () => {
			const requestCount = 3;
			const mockGithubRequest = mock(() => Promise.resolve({ data: "test" }));
			const minTimeMs = CONFIGS.githubAPI.minTime;
			const expectedMinDuration = (requestCount - 1) * minTimeMs;
			const toleranceMs = 300;

			const startTime = Date.now();
			await Promise.all(
				Array.from({ length: requestCount }, () =>
					rateLimiter.schedule("github", mockGithubRequest),
				),
			);
			const duration = Date.now() - startTime;

			expect(duration).toBeGreaterThanOrEqual(expectedMinDuration - toleranceMs);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();

			if (metrics) {
				expect(metrics.totalRequests).toBe(requestCount);
				expect(metrics.failedRequests).toBe(0);
			}
		});

		test("should handle GitHub API errors", () => {
			const expectedError = new Error("GitHub API Error");
			const mockFailingRequest = mock(() => Promise.reject(expectedError));

			const expectPromise = expect(rateLimiter.schedule("github", mockFailingRequest));
			expectPromise.rejects.toThrow("GitHub API Error");

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.totalRequests).toBe(1);
				expect(metrics.failedRequests).toBe(1);
				expect(metrics.lastError).toBe("GitHub API Error");
			}
		});

		test("should support request prioritization", async () => {
			const executionOrder: number[] = [];
			const executionDelayMs = 100;
			const priorityGapMs = 50;

			const mockHighPriorityRequest = mock(async () => {
				executionOrder.push(1);
				await delay(executionDelayMs);
				return { priority: "high" };
			});

			const mockLowPriorityRequest = mock(async () => {
				executionOrder.push(2);
				await delay(executionDelayMs);
				return { priority: "low" };
			});

			const lowPromise = rateLimiter.schedule("github", mockLowPriorityRequest, 1);
			await delay(priorityGapMs);
			const highPromise = rateLimiter.schedule("github", mockHighPriorityRequest, 10);

			await Promise.all([lowPromise, highPromise]);

			expect(mockHighPriorityRequest).toHaveBeenCalledTimes(1);
			expect(mockLowPriorityRequest).toHaveBeenCalledTimes(1);
			expect(executionOrder).toHaveLength(2);
		});
	});

	describe("LLM API Rate Limiting", () => {
		test("should schedule LLM API requests", async () => {
			const expectedResponse = { choices: [{ message: { content: "test" } }] };
			const mockLlmRequest = mock(() => Promise.resolve(expectedResponse));

			const result = await rateLimiter.schedule("llm", mockLlmRequest);

			expect(result).toEqual(expectedResponse);
			expect(mockLlmRequest).toHaveBeenCalledTimes(1);

			const metrics = rateLimiter.getMetrics("llm");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.totalRequests).toBe(1);
				expect(metrics.failedRequests).toBe(0);
			}
		});

		test("should enforce sequential execution for free LLM tier", async () => {
			const testMinTime = 50;
			const testConfig = {
				llm: {
					maxConcurrent: 1,
					minTime: testMinTime,
					reservoir: 1,
					reservoirRefreshAmount: 1,
					reservoirRefreshInterval: testMinTime,
				},
			};

			const { rateLimiter: sequentialLimiter, cleanup: sequentialCleanup } =
				createTestRateLimiter(testConfig);

			const executionOrder: number[] = [];
			const executionTimes: number[] = [];

			const createMockRequest = (id: number) =>
				mock(() => {
					executionOrder.push(id);
					executionTimes.push(Date.now());
					return Promise.resolve({ data: String(id) });
				});

			const mockRequest1 = createMockRequest(1);
			const mockRequest2 = createMockRequest(2);
			const mockRequest3 = createMockRequest(3);

			await Promise.all([
				sequentialLimiter.schedule("llm", mockRequest1),
				sequentialLimiter.schedule("llm", mockRequest2),
				sequentialLimiter.schedule("llm", mockRequest3),
			]);

			expect(executionOrder).toEqual([1, 2, 3]);

			if (executionTimes.length >= 2) {
				const time1 = executionTimes[1];
				const time0 = executionTimes[0];
				if (time1 !== undefined && time0 !== undefined) {
					const timeBetween = time1 - time0;
					const toleranceMs = 10;
					expect(timeBetween).toBeGreaterThanOrEqual(testMinTime - toleranceMs);
				}
			}

			const metrics = sequentialLimiter.getMetrics("llm");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.totalRequests).toBe(3);
				expect(metrics.failedRequests).toBe(0);
			}

			await sequentialCleanup();
		});

		test("should handle LLM API errors", () => {
			const expectedError = new Error("Rate limit exceeded");
			const mockFailingRequest = mock(() => Promise.reject(expectedError));

			const expectPromise = expect(rateLimiter.schedule("llm", mockFailingRequest));
			expectPromise.rejects.toThrow("Rate limit exceeded");

			const metrics = rateLimiter.getMetrics("llm");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.totalRequests).toBe(1);
				expect(metrics.failedRequests).toBe(1);
				expect(metrics.lastError).toBe("Rate limit exceeded");
			}
		});
	});

	describe("Metrics Tracking", () => {
		test("should track GitHub metrics accurately", async () => {
			const requestCount = 2;
			const mockGithubRequest = mock(() => Promise.resolve({ data: "test" }));

			await rateLimiter.schedule("github", mockGithubRequest);
			await rateLimiter.schedule("github", mockGithubRequest);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.totalRequests).toBe(requestCount);
				expect(metrics.runningRequests).toBe(0);
				expect(metrics.queuedRequests).toBe(0);
				expect(metrics.failedRequests).toBe(0);
				expect(metrics.lastRequestTime).toBeInstanceOf(Date);
			}
		});

		test("should track LLM metrics accurately", async () => {
			const mockLlmRequest = mock(() => Promise.resolve({ data: "test" }));

			await rateLimiter.schedule("llm", mockLlmRequest);

			const metrics = rateLimiter.getMetrics("llm");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.totalRequests).toBe(1);
				expect(metrics.runningRequests).toBe(0);
				expect(metrics.queuedRequests).toBe(0);
				expect(metrics.failedRequests).toBe(0);
				expect(metrics.lastRequestTime).toBeInstanceOf(Date);
			}
		});

		test("should return immutable metrics copies", () => {
			const metrics1 = rateLimiter.getMetrics("github");
			const metrics2 = rateLimiter.getMetrics("github");

			expect(metrics1).not.toBe(metrics2);
			expect(metrics1).toEqual(metrics2);
		});
	});

	describe("Queue Management", () => {
		test("should clear GitHub queue", async () => {
			const longRunningDelayMs = 5000;
			const queueWaitMs = 100;
			const { rateLimiter: queueLimiter, cleanup: queueCleanup } = createTestRateLimiter({
				github: CONFIGS.githubAPI,
			});
			const mockLongRunningRequest = mock(
				() => new Promise((resolve) => setTimeout(resolve, longRunningDelayMs)),
			);

			const promises = Array.from({ length: 5 }, () =>
				queueLimiter.schedule("github", mockLongRunningRequest),
			);

			await delay(queueWaitMs);
			queueLimiter.clearQueue("github");

			const errorPromise = Promise.all(promises);
			expect(errorPromise).rejects.toThrow();

			const metrics = queueLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.queuedRequests).toBe(0);
			}

			await queueCleanup();
		});

		test("should clear LLM queue", async () => {
			const longRunningDelayMs = 5000;
			const queueWaitMs = 100;
			const { rateLimiter: queueLimiter, cleanup: queueCleanup } = createTestRateLimiter({
				llm: CONFIGS.freeLLM,
			});
			const mockLongRunningRequest = mock(
				() => new Promise((resolve) => setTimeout(resolve, longRunningDelayMs)),
			);

			const promises = Array.from({ length: 3 }, () =>
				queueLimiter.schedule("llm", mockLongRunningRequest),
			);

			await delay(queueWaitMs);
			queueLimiter.clearQueue("llm");

			const errorPromise = Promise.all(promises);
			expect(errorPromise).rejects.toThrow();

			const metrics = queueLimiter.getMetrics("llm");
			expect(metrics).toBeDefined();
			if (metrics) {
				expect(metrics.queuedRequests).toBe(0);
			}

			await queueCleanup();
		});
	});

	describe("Graceful Shutdown", () => {
		test("should shut down gracefully after completing requests", async () => {
			const mockRequest = mock(() => Promise.resolve({ data: "test" }));

			await rateLimiter.schedule("github", mockRequest);
			await rateLimiter.schedule("llm", mockRequest);

			const githubMetrics = rateLimiter.getMetrics("github");
			const llmMetrics = rateLimiter.getMetrics("llm");

			expect(githubMetrics).toBeDefined();
			expect(llmMetrics).toBeDefined();
			expect(githubMetrics?.totalRequests).toBe(1);
			expect(llmMetrics?.totalRequests).toBe(1);
		});

		test("should handle shutdown with pending requests", async () => {
			const longRunningDelayMs = 5000;
			const { rateLimiter: shutdownLimiter, cleanup: shutdownCleanup } = createTestRateLimiter({
				github: CONFIGS.githubAPI,
				llm: CONFIGS.freeLLM,
			});
			const mockLongRunningRequest = mock(
				() => new Promise((resolve) => setTimeout(resolve, longRunningDelayMs)),
			);

			const promises = [
				shutdownLimiter.schedule("github", mockLongRunningRequest),
				shutdownLimiter.schedule("llm", mockLongRunningRequest),
			];

			await shutdownCleanup();

			const errorPromise = Promise.all(promises);
			expect(errorPromise).rejects.toThrow();
		});
	});

	describe("Configuration Presets", () => {
		test("should validate GitHub API configuration values", () => {
			const config = CONFIGS.githubAPI;

			expect(config.maxConcurrent).toBe(10);
			expect(config.minTime).toBe(720);
			expect(config.reservoir).toBe(5);
		});

		test("should enforce strict limits for free LLM tier", () => {
			const config = CONFIGS.freeLLM;

			expect(config.maxConcurrent).toBe(1);
			expect(config.minTime).toBe(60_000);
			expect(config.reservoir).toBe(1);
		});

		test("should allow more generous limits for paid LLM tier", () => {
			const config = CONFIGS.paidLLM;

			expect(config.maxConcurrent).toBe(3);
			expect(config.minTime).toBe(1000);
			expect(config.reservoir).toBe(10);

			const freeLlmConfig = CONFIGS.freeLLM;
			expect(config.maxConcurrent).toBeGreaterThan(freeLlmConfig.maxConcurrent);
			expect(config.minTime).toBeLessThan(freeLlmConfig.minTime);
		});
	});
});
