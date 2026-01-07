import { sleep } from "bun";
import { afterEach, describe, expect, mock, test } from "bun:test";

import type { RateLimiter, RateLimiterMetrics } from "@/services/";

import { CONFIGS, createRateLimiter } from "@/services/";

/**
 * Validates that metrics contain expected structure with zero values.
 *
 * @param metrics Metrics object to validate
 */
function expectZeroMetrics(metrics: RateLimiterMetrics): void {
	expect(metrics).toBeDefined();
	expect(metrics.totalRequests).toBe(0);
	expect(metrics.queuedRequests).toBe(0);
	expect(metrics.runningRequests).toBe(0);
	expect(metrics.failedRequests).toBe(0);
}

describe("RateLimiter", () => {
	let rateLimiter: RateLimiter | undefined;

	afterEach(async () => {
		if (rateLimiter) await rateLimiter.shutdown();
	});

	describe("Initialization", () => {
		test("should initialize with default configurations when created", () => {
			rateLimiter = createRateLimiter(CONFIGS.githubAPI, "test-init");

			expect(rateLimiter).toBeDefined();

			const metrics = rateLimiter.getMetrics();
			expectZeroMetrics(metrics);
		});

		test("should accept custom configurations when provided", () => {
			const customConfig = {
				maxConcurrent: 5,
				minTime: 1000,
			};

			rateLimiter = createRateLimiter(customConfig, "test-custom");

			expect(rateLimiter).toBeDefined();

			const metrics = rateLimiter.getMetrics();
			expectZeroMetrics(metrics);
		});

		test("should support different LLM tiers when configured", async () => {
			const freeLimiter = createRateLimiter(CONFIGS.freeLLM, "test-free");
			const paidLimiter = createRateLimiter(CONFIGS.paidLLM, "test-paid");

			expect(freeLimiter).toBeDefined();
			expect(paidLimiter).toBeDefined();

			expectZeroMetrics(freeLimiter.getMetrics());
			expectZeroMetrics(paidLimiter.getMetrics());

			await freeLimiter.shutdown();
			await paidLimiter.shutdown();
		});
	});

	describe("GitHub API Rate Limiting", () => {
		test("should schedule GitHub API requests when request is provided", async () => {
			rateLimiter = createRateLimiter(CONFIGS.githubAPI, "test-schedule");
			const expectedResponse = { data: "test" };
			const mockGithubRequest = mock(() => Promise.resolve(expectedResponse));

			const result = await rateLimiter.schedule(mockGithubRequest);

			expect(result).toEqual(expectedResponse);
			expect(mockGithubRequest).toHaveBeenCalledTimes(1);

			const metrics = rateLimiter.getMetrics();
			expect(metrics).toBeDefined();
			expect(metrics.totalRequests).toBe(1);
			expect(metrics.queuedRequests).toBe(0);
			expect(metrics.runningRequests).toBe(0);
		});

		test("should handle multiple concurrent GitHub requests when multiple requests are made", async () => {
			rateLimiter = createRateLimiter(CONFIGS.githubAPI, "test-concurrent");

			const requestCount = 5;
			const mockGithubRequest = mock(() => Promise.resolve({ data: "test" }));

			const requests = Array.from(
				{ length: requestCount },
				() => rateLimiter?.schedule(mockGithubRequest) ?? Promise.resolve(null),
			);
			await Promise.all(requests);

			expect(mockGithubRequest).toHaveBeenCalledTimes(requestCount);

			const metrics = rateLimiter.getMetrics();
			expect(metrics).toBeDefined();
			expect(metrics.totalRequests).toBe(requestCount);
			expect(metrics.queuedRequests).toBe(0);
			expect(metrics.runningRequests).toBe(0);
		});

		test("should respect rate limits for GitHub API when requests are made", async () => {
			rateLimiter = createRateLimiter(CONFIGS.githubAPI, "test-ratelimit");
			const requestCount = 3;
			const mockGithubRequest = mock(() => Promise.resolve({ data: "test" }));
			const minTimeMs = CONFIGS.githubAPI.minTime;
			const expectedMinDuration = (requestCount - 1) * minTimeMs;
			const toleranceMs = 300;

			const startTime = Date.now();
			await Promise.all(
				Array.from(
					{ length: requestCount },
					() => rateLimiter?.schedule(mockGithubRequest) ?? Promise.resolve(null),
				),
			);
			const duration = Date.now() - startTime;

			expect(duration).toBeGreaterThanOrEqual(expectedMinDuration - toleranceMs);

			const metrics = rateLimiter.getMetrics();
			expect(metrics).toBeDefined();
			expect(metrics.totalRequests).toBe(requestCount);
		});

		describe("LLM API Rate Limiting", () => {
			test("should schedule LLM API requests when request is provided", async () => {
				rateLimiter = createRateLimiter(CONFIGS.freeLLM, "test-llm");
				const expectedResponse = { choices: [{ message: { content: "test" } }] };
				const mockLlmRequest = mock(() => Promise.resolve(expectedResponse));

				const result = await rateLimiter.schedule(mockLlmRequest);

				expect(result).toEqual(expectedResponse);
				expect(mockLlmRequest).toHaveBeenCalledTimes(1);

				const metrics = rateLimiter.getMetrics();
				expect(metrics).toBeDefined();
				expect(metrics.totalRequests).toBe(1);
				expect(metrics.queuedRequests).toBe(0);
			});

			test("should handle LLM API errors when request fails", () => {
				rateLimiter = createRateLimiter(CONFIGS.freeLLM, "test-llm-error");
				const expectedError = new Error("Rate limit exceeded");
				const mockFailingRequest = mock(() => Promise.reject(expectedError));

				const expectPromise = expect(rateLimiter.schedule(mockFailingRequest));
				expectPromise.rejects.toThrow("Rate limit exceeded");

				const metrics = rateLimiter.getMetrics();
				expect(metrics).toBeDefined();
				expect(metrics.failedRequests).toBeGreaterThan(0);
			});
		});

		describe("Metrics Tracking", () => {
			test("should track GitHub metrics accurately when requests are made", async () => {
				rateLimiter = createRateLimiter(CONFIGS.githubAPI, "test-metrics");
				const requestCount = 2;
				const mockGithubRequest = mock(() => Promise.resolve({ data: "test" }));

				await rateLimiter.schedule(mockGithubRequest);
				await rateLimiter.schedule(mockGithubRequest);

				const metrics = rateLimiter.getMetrics();
				expect(metrics).toBeDefined();
				expect(metrics.totalRequests).toBe(requestCount);
				expect(metrics.runningRequests).toBe(0);
				expect(metrics.queuedRequests).toBe(0);
				expect(metrics.failedRequests).toBe(0);
				expect(metrics.lastRequestTime).toBeDefined();
			});

			test("should track LLM metrics accurately when LLM requests are made", async () => {
				rateLimiter = createRateLimiter(CONFIGS.freeLLM, "test-llm-metrics");
				const mockLlmRequest = mock(() => Promise.resolve({ data: "test" }));

				await rateLimiter.schedule(mockLlmRequest);

				const metrics = rateLimiter.getMetrics();
				expect(metrics).toBeDefined();
				expect(metrics.totalRequests).toBe(1);
				expect(metrics.runningRequests).toBe(0);
				expect(metrics.queuedRequests).toBe(0);
				expect(metrics.failedRequests).toBe(0);
				expect(metrics.lastRequestTime).toBeDefined();
			});

			test("should return immutable metrics copies when getMetrics is called", () => {
				rateLimiter = createRateLimiter(CONFIGS.githubAPI, "test-immutable");

				const metrics1 = rateLimiter.getMetrics();
				const metrics2 = rateLimiter.getMetrics();

				expect(metrics1).not.toBe(metrics2);
				expect(metrics1).toEqual(metrics2);
			});
		});

		describe("Queue Management", () => {
			test("should clear GitHub queue when clearQueue is called", async () => {
				const longRunningDelayMs = 5000;
				const queueWaitMs = 100;
				rateLimiter = createRateLimiter(CONFIGS.githubAPI, "test-queue");
				const mockLongRunningRequest = mock(
					() => new Promise((resolve) => setTimeout(resolve, longRunningDelayMs)),
				);

				const promises = Array.from(
					{ length: 5 },
					() => rateLimiter?.schedule(mockLongRunningRequest) ?? Promise.resolve(null),
				);

				await sleep(queueWaitMs);
				rateLimiter.clearQueue();

				const errorPromise = Promise.all(promises);
				expect(errorPromise).rejects.toThrow();

				const metrics = rateLimiter.getMetrics();
				expect(metrics).toBeDefined();
				expect(metrics.queuedRequests).toBe(0);
			});

			test("should clear LLM queue when clearQueue is called", async () => {
				const longRunningDelayMs = 5000;
				const queueWaitMs = 100;
				rateLimiter = createRateLimiter(CONFIGS.freeLLM, "test-llm-queue");
				const mockLongRunningRequest = mock(
					() => new Promise((resolve) => setTimeout(resolve, longRunningDelayMs)),
				);

				const promises = Array.from(
					{ length: 5 },
					() => rateLimiter?.schedule(mockLongRunningRequest) ?? Promise.resolve(null),
				);

				await sleep(queueWaitMs);
				rateLimiter.clearQueue();

				const errorPromise = Promise.all(promises);
				expect(errorPromise).rejects.toThrow();

				const metrics = rateLimiter.getMetrics();
				expect(metrics).toBeDefined();
				expect(metrics.queuedRequests).toBe(0);
			});
		});

		describe("Graceful Shutdown", () => {
			test("should shut down gracefully after completing requests when shutdown is called", async () => {
				rateLimiter = createRateLimiter(CONFIGS.githubAPI, "test-shutdown");
				const mockGithubRequest = mock(() => Promise.resolve({ data: "test" }));

				await rateLimiter.schedule(mockGithubRequest);

				await rateLimiter.shutdown();

				const metrics = rateLimiter.getMetrics();
				expect(metrics.totalRequests).toBe(1);
			});

			test("should handle shutdown with pending requests when shutdown is called", async () => {
				const longRunningDelayMs = 5000;
				rateLimiter = createRateLimiter(CONFIGS.githubAPI, "test-shutdown-pending");
				const mockLongRunningRequest = mock(
					() => new Promise((resolve) => setTimeout(resolve, longRunningDelayMs)),
				);

				const promises = Array.from(
					{ length: 3 },
					() => rateLimiter?.schedule(mockLongRunningRequest) ?? Promise.resolve(null),
				);

				await rateLimiter.shutdown();

				for (const promise of promises) {
					expect(promise).rejects.toThrow();
				}
			});
		});

		describe("Configuration Presets", () => {
			test("should validate GitHub API configuration values when CONFIGS.githubAPI is accessed", () => {
				expect(CONFIGS.githubAPI.maxConcurrent).toBe(10);
				expect(CONFIGS.githubAPI.minTime).toBe(720);
				expect(CONFIGS.githubAPI.reservoir).toBe(5);
			});

			test("should use optimized configuration for free LLM tier when CONFIGS.freeLLM is accessed", () => {
				expect(CONFIGS.freeLLM.maxConcurrent).toBe(5);
				expect(CONFIGS.freeLLM.minTime).toBe(20_000);
				expect(CONFIGS.freeLLM.reservoir).toBe(5);
			});

			test("should allow more generous limits for paid LLM tier when CONFIGS.paidLLM is accessed", () => {
				expect(CONFIGS.paidLLM.maxConcurrent).toBeGreaterThan(1);
				expect(CONFIGS.paidLLM.minTime).toBeLessThan(60_000);
				expect(CONFIGS.paidLLM.reservoir).toBeGreaterThan(1);

				expect(CONFIGS.paidLLM.maxConcurrent).toBe(3);
				expect(CONFIGS.paidLLM.minTime).toBe(1000);
				expect(CONFIGS.paidLLM.reservoir).toBe(10);
			});
		});
	});
});
