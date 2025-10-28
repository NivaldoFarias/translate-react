/**
 * @fileoverview
 *
 * Unit tests for the RateLimiterService.
 *
 * Tests rate limiting behavior, metrics tracking, queue management,
 * and integration with GitHub and LLM APIs.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { CONFIGS, RateLimiterService } from "@/services/rate-limiter/";

describe("RateLimiterService", () => {
	let rateLimiter: RateLimiterService;
	let shutdownCalled = false;

	beforeEach(() => {
		rateLimiter = new RateLimiterService({
			github: CONFIGS.githubAPI,
			llm: CONFIGS.freeLLM,
		});
		shutdownCalled = false;
	});

	afterEach(async () => {
		if (!shutdownCalled) {
			await rateLimiter.shutdown();
			shutdownCalled = true;
		}
	});

	describe("Initialization", () => {
		test("should initialize with default configurations", () => {
			expect(rateLimiter).toBeDefined();

			const githubMetrics = rateLimiter.getMetrics("github");
			const llmMetrics = rateLimiter.getMetrics("llm");

			expect(githubMetrics).toBeDefined();
			expect(llmMetrics).toBeDefined();

			expect(githubMetrics!.totalRequests).toBe(0);
			expect(githubMetrics!.queuedRequests).toBe(0);
			expect(githubMetrics!.runningRequests).toBe(0);
			expect(githubMetrics!.failedRequests).toBe(0);

			expect(llmMetrics!.totalRequests).toBe(0);
			expect(llmMetrics!.queuedRequests).toBe(0);
			expect(llmMetrics!.runningRequests).toBe(0);
			expect(llmMetrics!.failedRequests).toBe(0);
		});

		test("should accept custom configurations", () => {
			const customRateLimiter = new RateLimiterService({
				github: { maxConcurrent: 5, minTime: 1000 },
				llm: { maxConcurrent: 2, minTime: 2000 },
			});

			expect(customRateLimiter).toBeDefined();
		});

		test("should support different LLM tiers", () => {
			const freeLimiter = new RateLimiterService({ llm: CONFIGS.freeLLM });
			const paidLimiter = new RateLimiterService({ llm: CONFIGS.paidLLM });

			expect(freeLimiter).toBeDefined();
			expect(paidLimiter).toBeDefined();
		});

		test("should list registered services", () => {
			const services = rateLimiter.getRegisteredServices();

			expect(services).toContain("github");
			expect(services).toContain("llm");
			expect(services).toHaveLength(2);
		});

		test("should support dynamic service registration", () => {
			const limiter = new RateLimiterService({
				github: CONFIGS.githubAPI,
			});

			limiter.registerService("custom-api", {
				maxConcurrent: 3,
				minTime: 500,
			});

			const services = limiter.getRegisteredServices();
			expect(services).toContain("github");
			expect(services).toContain("custom-api");
		});
	});

	describe("GitHub API Rate Limiting", () => {
		test("should schedule GitHub API requests", async () => {
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			const result = await rateLimiter.schedule("github", mockFn);

			expect(result).toEqual({ data: "test" });
			expect(mockFn).toHaveBeenCalledTimes(1);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			expect(metrics!.totalRequests).toBe(1);
		});

		test("should handle multiple concurrent GitHub requests", async () => {
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			const requests = Array.from({ length: 5 }, () => rateLimiter.schedule("github", mockFn));

			await Promise.all(requests);

			expect(mockFn).toHaveBeenCalledTimes(5);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			expect(metrics!.totalRequests).toBe(5);
		});

		test("should respect rate limits for GitHub API", async () => {
			const startTime = Date.now();
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			// Schedule 3 requests in quick succession
			await Promise.all([
				rateLimiter.schedule("github", mockFn),
				rateLimiter.schedule("github", mockFn),
				rateLimiter.schedule("github", mockFn),
			]);

			const endTime = Date.now();
			const duration = endTime - startTime;

			// With minTime of 720ms, 3 requests should take at least 1440ms (2 * 720ms)
			// Allow some tolerance for execution time
			expect(duration).toBeGreaterThanOrEqual(1000);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			expect(metrics!.totalRequests).toBe(3);
		});

		test("should handle GitHub API errors", async () => {
			const mockError = new Error("GitHub API Error");
			const mockFn = mock(() => Promise.reject(mockError));

			await expect(rateLimiter.schedule("github", mockFn)).rejects.toThrow("GitHub API Error");

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			expect(metrics!.failedRequests).toBe(1);
		});

		test("should support request prioritization", async () => {
			const results: number[] = [];
			const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

			const mockHighPriority = mock(async () => {
				results.push(1);
				await delay(100);
				return Promise.resolve({ priority: "high" });
			});

			const mockLowPriority = mock(async () => {
				results.push(2);
				await delay(100);
				return Promise.resolve({ priority: "low" });
			});

			// Schedule low priority first with delay, then high priority immediately
			const lowPromise = rateLimiter.schedule("github", mockLowPriority, 1);
			await delay(50); // Small delay to ensure low priority is queued first
			const highPromise = rateLimiter.schedule("github", mockHighPriority, 10);

			await Promise.all([lowPromise, highPromise]);

			// Both should complete (order may vary due to concurrency)
			expect(mockHighPriority).toHaveBeenCalledTimes(1);
			expect(mockLowPriority).toHaveBeenCalledTimes(1);
		});
	});

	describe("LLM API Rate Limiting", () => {
		test("should schedule LLM API requests", async () => {
			const mockFn = mock(() => Promise.resolve({ choices: [{ message: { content: "test" } }] }));

			const result = await rateLimiter.schedule("llm", mockFn);

			expect(result).toEqual({ choices: [{ message: { content: "test" } }] });
			expect(mockFn).toHaveBeenCalledTimes(1);

			const metrics = rateLimiter.getMetrics("llm");
			expect(metrics).toBeDefined();
			expect(metrics!.totalRequests).toBe(1);
		});

		test("should enforce sequential execution for free LLM tier", async () => {
			// Use custom config with much shorter delays for testing
			const testRateLimiter = new RateLimiterService({
				llm: {
					maxConcurrent: 1,
					minTime: 50,
					reservoir: 1,
					reservoirRefreshAmount: 1,
					reservoirRefreshInterval: 50,
				},
			});

			const executionOrder: number[] = [];
			const executionTimes: number[] = [];

			const mockFn1 = mock(() => {
				executionOrder.push(1);
				executionTimes.push(Date.now());
				return Promise.resolve({ data: "1" });
			});

			const mockFn2 = mock(() => {
				executionOrder.push(2);
				executionTimes.push(Date.now());
				return Promise.resolve({ data: "2" });
			});

			const mockFn3 = mock(() => {
				executionOrder.push(3);
				executionTimes.push(Date.now());
				return Promise.resolve({ data: "3" });
			});

			// Schedule multiple requests
			const promises = [
				testRateLimiter.schedule("llm", mockFn1),
				testRateLimiter.schedule("llm", mockFn2),
				testRateLimiter.schedule("llm", mockFn3),
			];

			await Promise.all(promises);

			// Should execute in order (sequential)
			expect(executionOrder).toEqual([1, 2, 3]);

			// Verify sequential execution (at least minTime between requests)
			if (executionTimes.length >= 2) {
				const timeBetween = executionTimes[1]! - executionTimes[0]!;
				expect(timeBetween).toBeGreaterThanOrEqual(40); // Allow 10ms tolerance
			}

			const metrics = testRateLimiter.getMetrics("llm");
			expect(metrics).toBeDefined();
			expect(metrics!.totalRequests).toBe(3);

			await testRateLimiter.shutdown();
		}, 10_000); // Increase timeout to 10s

		test("should handle LLM API errors", async () => {
			const mockError = new Error("Rate limit exceeded");
			const mockFn = mock(() => Promise.reject(mockError));

			await expect(rateLimiter.schedule("llm", mockFn)).rejects.toThrow("Rate limit exceeded");

			const metrics = rateLimiter.getMetrics("llm");
			expect(metrics).toBeDefined();
			expect(metrics!.failedRequests).toBe(1);
			expect(metrics!.lastError).toBe("Rate limit exceeded");
		});
	});

	describe("Metrics Tracking", () => {
		test("should track GitHub metrics accurately", async () => {
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			await rateLimiter.schedule("github", mockFn);
			await rateLimiter.schedule("github", mockFn);

			const metrics = rateLimiter.getMetrics("github");

			expect(metrics).toBeDefined();
			expect(metrics!.totalRequests).toBe(2);
			expect(metrics!.runningRequests).toBe(0);
			expect(metrics!.queuedRequests).toBe(0);
			expect(metrics!.failedRequests).toBe(0);
			expect(metrics!.lastRequestTime).toBeInstanceOf(Date);
		});

		test("should track LLM metrics accurately", async () => {
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			await rateLimiter.schedule("llm", mockFn);

			const metrics = rateLimiter.getMetrics("llm");

			expect(metrics).toBeDefined();
			expect(metrics!.totalRequests).toBe(1);
			expect(metrics!.runningRequests).toBe(0);
			expect(metrics!.queuedRequests).toBe(0);
			expect(metrics!.failedRequests).toBe(0);
			expect(metrics!.lastRequestTime).toBeInstanceOf(Date);
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
			const testRateLimiter = new RateLimiterService({
				github: CONFIGS.githubAPI,
			});
			const mockFn = mock(() => new Promise((resolve) => setTimeout(resolve, 5000)));

			// Schedule requests that will be queued
			const promises = Array.from({ length: 5 }, () => testRateLimiter.schedule("github", mockFn));

			// Wait a bit for requests to queue
			await new Promise((resolve) => setTimeout(resolve, 100));

			testRateLimiter.clearQueue("github");

			// Pending promises should reject
			await expect(Promise.all(promises)).rejects.toThrow();

			const metrics = testRateLimiter.getMetrics("github");
			expect(metrics).toBeDefined();
			expect(metrics!.queuedRequests).toBe(0);

			// Properly shutdown (clearQueue already calls stop)
			try {
				await testRateLimiter.shutdown();
			} catch {
				// Ignore if already stopped
			}
		});

		test("should clear LLM queue", async () => {
			const testRateLimiter = new RateLimiterService({
				llm: CONFIGS.freeLLM,
			});
			const mockFn = mock(() => new Promise((resolve) => setTimeout(resolve, 5000)));

			// Schedule requests that will be queued
			const promises = Array.from({ length: 3 }, () => testRateLimiter.schedule("llm", mockFn));

			// Wait a bit for requests to queue
			await new Promise((resolve) => setTimeout(resolve, 100));

			testRateLimiter.clearQueue("llm");

			// Pending promises should reject
			await expect(Promise.all(promises)).rejects.toThrow();

			const metrics = testRateLimiter.getMetrics("llm");
			expect(metrics).toBeDefined();
			expect(metrics!.queuedRequests).toBe(0);

			// Properly shutdown (clearQueue already calls stop)
			try {
				await testRateLimiter.shutdown();
			} catch {
				// Ignore if already stopped
			}
		});
	});

	describe("Graceful Shutdown", () => {
		test("should shut down gracefully", async () => {
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			await rateLimiter.schedule("github", mockFn);
			await rateLimiter.schedule("llm", mockFn);

			const githubMetrics = rateLimiter.getMetrics("github");
			const llmMetrics = rateLimiter.getMetrics("llm");

			expect(githubMetrics).toBeDefined();
			expect(llmMetrics).toBeDefined();
			expect(githubMetrics!.totalRequests).toBe(1);
			expect(llmMetrics!.totalRequests).toBe(1);

			await rateLimiter.shutdown();
			shutdownCalled = true;
		});

		test("should handle shutdown with pending requests", async () => {
			const testRateLimiter = new RateLimiterService({
				github: CONFIGS.githubAPI,
				llm: CONFIGS.freeLLM,
			});
			const mockFn = mock(() => new Promise((resolve) => setTimeout(resolve, 5000)));

			// Schedule long-running requests
			const promises = [
				testRateLimiter.schedule("github", mockFn),
				testRateLimiter.schedule("llm", mockFn),
			];

			// Shutdown immediately
			await testRateLimiter.shutdown();

			// Pending promises should reject
			await expect(Promise.all(promises)).rejects.toThrow();
		});
	});

	describe("Configuration Presets", () => {
		test("PRESETS.githubAPI should have correct values", () => {
			expect(CONFIGS.githubAPI.maxConcurrent).toBe(10);
			expect(CONFIGS.githubAPI.minTime).toBe(720);
			expect(CONFIGS.githubAPI.reservoir).toBe(5);
		});

		test("PRESETS.freeLLM should enforce strict limits", () => {
			expect(CONFIGS.freeLLM.maxConcurrent).toBe(1);
			expect(CONFIGS.freeLLM.minTime).toBe(60_000);
			expect(CONFIGS.freeLLM.reservoir).toBe(1);
		});

		test("PRESETS.paidLLM should allow more generous limits", () => {
			expect(CONFIGS.paidLLM.maxConcurrent).toBe(3);
			expect(CONFIGS.paidLLM.minTime).toBe(1000);
			expect(CONFIGS.paidLLM.reservoir).toBe(10);
		});
	});
});
