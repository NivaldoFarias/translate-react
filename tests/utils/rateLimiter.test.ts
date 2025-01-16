import { beforeEach, describe, expect, test } from "bun:test";

import { RateLimiter } from "../../src/utils/rateLimiter";

describe("RateLimiter", () => {
	let rateLimiter: RateLimiter;

	beforeEach(() => {
		rateLimiter = new RateLimiter(2, "Test API"); // 2 requests per second
	});

	test("should execute within rate limits", async () => {
		const results = await Promise.all([
			rateLimiter.schedule(() => Promise.resolve("first")),
			rateLimiter.schedule(() => Promise.resolve("second")),
		]);

		expect(results).toEqual(["first", "second"]);
	});

	test(
		"should handle concurrent requests",
		async () => {
			process.env.NODE_ENV = "development";
			const rateLimiter = new RateLimiter(30, "Test API"); // 30 requests per minute = 2 seconds delay
			const startTime = Date.now();

			const results = await Promise.all([
				rateLimiter.schedule(() => Promise.resolve(1)),
				rateLimiter.schedule(() => Promise.resolve(2)),
				rateLimiter.schedule(() => Promise.resolve(3)),
			]);

			const duration = Date.now() - startTime;
			expect(duration).toBeGreaterThan(1000);
			expect(results).toEqual([1, 2, 3]);

			process.env.NODE_ENV = "test";
		},
		{ timeout: 10000 },
	); // 10 second timeout

	test("should handle errors in scheduled tasks", async () => {
		const error = new Error("Test error");
		expect(rateLimiter.schedule(() => Promise.reject(error))).rejects.toThrow("Test error");
	});

	test(
		"should respect custom interval",
		async () => {
			process.env.NODE_ENV = "development";
			const customLimiter = new RateLimiter(30, "Custom API");
			const startTime = Date.now();

			await Promise.all([
				customLimiter.schedule(() => Promise.resolve(1)),
				customLimiter.schedule(() => Promise.resolve(2)),
			]);

			const duration = Date.now() - startTime;
			expect(duration).toBeGreaterThan(1000);

			process.env.NODE_ENV = "test";
		},
		{ timeout: 10000 },
	);

	test("should handle queue overflow", async () => {
		const maxConcurrent = 4;
		const limiter = new RateLimiter(1, "Overflow Test");

		const promises = Array(maxConcurrent + 1)
			.fill(0)
			.map((_, i) => limiter.schedule(() => Promise.resolve(i)));

		expect(Promise.all(promises)).resolves.toEqual([0, 1, 2, 3, 4]);
	});

	test("should clear queue on reset", async () => {
		const limiter = new RateLimiter(1, "Reset Test");
		const promise = limiter.schedule(() => Promise.resolve("test"));
		limiter.reset();

		expect(promise).resolves.toBe("test");
	});
});
