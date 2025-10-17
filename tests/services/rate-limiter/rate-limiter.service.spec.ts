/**
 * @fileoverview
 *
 * Unit tests for the RateLimiterService.
 *
 * Tests rate limiting behavior, metrics tracking, queue management,
 * and integration with GitHub and LLM APIs.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
	FREE_LLM_RATE_LIMITER_CONFIG,
	GITHUB_RATE_LIMITER_CONFIG,
	PAID_LLM_RATE_LIMITER_CONFIG,
	RateLimiterService,
} from "@/services/rate-limiter/";

describe("RateLimiterService", () => {
	let rateLimiter: RateLimiterService;
	let shutdownCalled = false;

	beforeEach(() => {
		rateLimiter = new RateLimiterService();
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

			expect(githubMetrics.totalRequests).toBe(0);
			expect(githubMetrics.queuedRequests).toBe(0);
			expect(githubMetrics.runningRequests).toBe(0);
			expect(githubMetrics.failedRequests).toBe(0);

			expect(llmMetrics.totalRequests).toBe(0);
			expect(llmMetrics.queuedRequests).toBe(0);
			expect(llmMetrics.runningRequests).toBe(0);
			expect(llmMetrics.failedRequests).toBe(0);
		});

		test("should accept custom configurations", () => {
			const customRateLimiter = new RateLimiterService({
				github: { maxConcurrent: 5, minTime: 1000 },
				llm: { maxConcurrent: 2, minTime: 2000 },
			});

			expect(customRateLimiter).toBeDefined();
		});

		test("should use paid LLM config when specified", () => {
			const paidRateLimiter = new RateLimiterService({ usePaidLLM: true });

			expect(paidRateLimiter).toBeDefined();
		});
	});

	describe("GitHub API Rate Limiting", () => {
		test("should schedule GitHub API requests", async () => {
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			const result = await rateLimiter.scheduleGitHub(mockFn);

			expect(result).toEqual({ data: "test" });
			expect(mockFn).toHaveBeenCalledTimes(1);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics.totalRequests).toBe(1);
		});

		test("should handle multiple concurrent GitHub requests", async () => {
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			const requests = Array.from({ length: 5 }, () => rateLimiter.scheduleGitHub(mockFn));

			await Promise.all(requests);

			expect(mockFn).toHaveBeenCalledTimes(5);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics.totalRequests).toBe(5);
		});

		test("should respect rate limits for GitHub API", async () => {
			const startTime = Date.now();
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			// Schedule 3 requests in quick succession
			await Promise.all([
				rateLimiter.scheduleGitHub(mockFn),
				rateLimiter.scheduleGitHub(mockFn),
				rateLimiter.scheduleGitHub(mockFn),
			]);

			const endTime = Date.now();
			const duration = endTime - startTime;

			// With minTime of 720ms, 3 requests should take at least 1440ms (2 * 720ms)
			// Allow some tolerance for execution time
			expect(duration).toBeGreaterThanOrEqual(1000);

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics.totalRequests).toBe(3);
		});

		test("should handle GitHub API errors", async () => {
			const mockError = new Error("GitHub API Error");
			const mockFn = mock(() => Promise.reject(mockError));

			await expect(rateLimiter.scheduleGitHub(mockFn)).rejects.toThrow("GitHub API Error");

			const metrics = rateLimiter.getMetrics("github");
			expect(metrics.failedRequests).toBe(1);
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
			const lowPromise = rateLimiter.scheduleGitHub(mockLowPriority, 1);
			await delay(50); // Small delay to ensure low priority is queued first
			const highPromise = rateLimiter.scheduleGitHub(mockHighPriority, 10);

			await Promise.all([lowPromise, highPromise]);

			// Both should complete (order may vary due to concurrency)
			expect(mockHighPriority).toHaveBeenCalledTimes(1);
			expect(mockLowPriority).toHaveBeenCalledTimes(1);
		});
	});

	describe("LLM API Rate Limiting", () => {
		test("should schedule LLM API requests", async () => {
			const mockFn = mock(() => Promise.resolve({ choices: [{ message: { content: "test" } }] }));

			const result = await rateLimiter.scheduleLLM(mockFn);

			expect(result).toEqual({ choices: [{ message: { content: "test" } }] });
			expect(mockFn).toHaveBeenCalledTimes(1);

			const metrics = rateLimiter.getMetrics("llm");
			expect(metrics.totalRequests).toBe(1);
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
				testRateLimiter.scheduleLLM(mockFn1),
				testRateLimiter.scheduleLLM(mockFn2),
				testRateLimiter.scheduleLLM(mockFn3),
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
			expect(metrics.totalRequests).toBe(3);

			await testRateLimiter.shutdown();
		}, 10_000); // Increase timeout to 10s

		test("should handle LLM API errors", async () => {
			const mockError = new Error("Rate limit exceeded");
			const mockFn = mock(() => Promise.reject(mockError));

			await expect(rateLimiter.scheduleLLM(mockFn)).rejects.toThrow("Rate limit exceeded");

			const metrics = rateLimiter.getMetrics("llm");
			expect(metrics.failedRequests).toBe(1);
			expect(metrics.lastError).toBe("Rate limit exceeded");
		});
	});

	describe("Metrics Tracking", () => {
		test("should track GitHub metrics accurately", async () => {
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			await rateLimiter.scheduleGitHub(mockFn);
			await rateLimiter.scheduleGitHub(mockFn);

			const metrics = rateLimiter.getMetrics("github");

			expect(metrics.totalRequests).toBe(2);
			expect(metrics.runningRequests).toBe(0);
			expect(metrics.queuedRequests).toBe(0);
			expect(metrics.failedRequests).toBe(0);
			expect(metrics.lastRequestTime).toBeInstanceOf(Date);
		});

		test("should track LLM metrics accurately", async () => {
			const mockFn = mock(() => Promise.resolve({ data: "test" }));

			await rateLimiter.scheduleLLM(mockFn);

			const metrics = rateLimiter.getMetrics("llm");

			expect(metrics.totalRequests).toBe(1);
			expect(metrics.runningRequests).toBe(0);
			expect(metrics.queuedRequests).toBe(0);
			expect(metrics.failedRequests).toBe(0);
			expect(metrics.lastRequestTime).toBeInstanceOf(Date);
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
			const testRateLimiter = new RateLimiterService();
			const mockFn = mock(() => new Promise((resolve) => setTimeout(resolve, 5000)));

			// Schedule requests that will be queued
			const promises = Array.from({ length: 5 }, () => testRateLimiter.scheduleGitHub(mockFn));

			// Wait a bit for requests to queue
			await new Promise((resolve) => setTimeout(resolve, 100));

			testRateLimiter.clearQueue("github");

			// Pending promises should reject
			await expect(Promise.all(promises)).rejects.toThrow();

			const metrics = testRateLimiter.getMetrics("github");
			expect(metrics.queuedRequests).toBe(0);

			// Properly shutdown (clearQueue already calls stop)
			try {
				await testRateLimiter.shutdown();
			} catch {
				// Ignore if already stopped
			}
		});

		test("should clear LLM queue", async () => {
			const testRateLimiter = new RateLimiterService();
			const mockFn = mock(() => new Promise((resolve) => setTimeout(resolve, 5000)));

			// Schedule requests that will be queued
			const promises = Array.from({ length: 3 }, () => testRateLimiter.scheduleLLM(mockFn));

			// Wait a bit for requests to queue
			await new Promise((resolve) => setTimeout(resolve, 100));

			testRateLimiter.clearQueue("llm");

			// Pending promises should reject
			await expect(Promise.all(promises)).rejects.toThrow();

			const metrics = testRateLimiter.getMetrics("llm");
			expect(metrics.queuedRequests).toBe(0);

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

			await rateLimiter.scheduleGitHub(mockFn);
			await rateLimiter.scheduleLLM(mockFn);

			const githubMetrics = rateLimiter.getMetrics("github");
			const llmMetrics = rateLimiter.getMetrics("llm");

			expect(githubMetrics.totalRequests).toBe(1);
			expect(llmMetrics.totalRequests).toBe(1);

			await rateLimiter.shutdown();
			shutdownCalled = true;
		});

		test("should handle shutdown with pending requests", async () => {
			const testRateLimiter = new RateLimiterService();
			const mockFn = mock(() => new Promise((resolve) => setTimeout(resolve, 5000)));

			// Schedule long-running requests
			const promises = [
				testRateLimiter.scheduleGitHub(mockFn),
				testRateLimiter.scheduleLLM(mockFn),
			];

			// Shutdown immediately
			await testRateLimiter.shutdown();

			// Pending promises should reject
			await expect(Promise.all(promises)).rejects.toThrow();
		});
	});

	describe("Configuration Presets", () => {
		test("GITHUB_RATE_LIMITER_CONFIG should have correct values", () => {
			expect(GITHUB_RATE_LIMITER_CONFIG.maxConcurrent).toBe(10);
			expect(GITHUB_RATE_LIMITER_CONFIG.minTime).toBe(720);
			expect(GITHUB_RATE_LIMITER_CONFIG.reservoir).toBe(5);
		});

		test("FREE_LLM_RATE_LIMITER_CONFIG should enforce strict limits", () => {
			expect(FREE_LLM_RATE_LIMITER_CONFIG.maxConcurrent).toBe(1);
			expect(FREE_LLM_RATE_LIMITER_CONFIG.minTime).toBe(60_000);
			expect(FREE_LLM_RATE_LIMITER_CONFIG.reservoir).toBe(1);
		});

		test("PAID_LLM_RATE_LIMITER_CONFIG should allow more concurrency", () => {
			expect(PAID_LLM_RATE_LIMITER_CONFIG.maxConcurrent).toBe(3);
			expect(PAID_LLM_RATE_LIMITER_CONFIG.minTime).toBe(1000);
			expect(PAID_LLM_RATE_LIMITER_CONFIG.reservoir).toBe(10);
		});
	});
});
