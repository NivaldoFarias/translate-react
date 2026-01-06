import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { timeOperation, Timer } from "@/utils/timing.util";

describe("timing.util", () => {
	describe("timeOperation", () => {
		beforeEach(() => {
			mock.restore();
		});

		test("should measure and return result of successful operation", async () => {
			const expectedResult = { data: "test" };
			const operation = mock(() => Promise.resolve(expectedResult));

			const result = await timeOperation("testOp", operation);

			expect(result).toEqual(expectedResult);
			expect(operation).toHaveBeenCalledTimes(1);
		});

		test("should re-throw error from failed operation", () => {
			const error = new Error("Operation failed");
			const operation = mock(() => Promise.reject(error));

			const promise = timeOperation("testOp", operation);
			expect(promise).rejects.toThrow("Operation failed");
			expect(operation).toHaveBeenCalledTimes(1);
		});

		test("should measure execution time for fast operation", async () => {
			const operation = mock(async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return "done";
			});

			const startTime = Date.now();
			const result = await timeOperation("fastOp", operation);
			const elapsed = Date.now() - startTime;

			expect(elapsed).toBeGreaterThanOrEqual(50);
			expect(elapsed).toBeLessThan(150); // Allow some overhead
		});
	});

	describe("Timer", () => {
		test("should track elapsed time", async () => {
			const timer = new Timer("testTimer");

			await new Promise((resolve) => setTimeout(resolve, 100));
			const elapsed = timer.elapsed();

			expect(elapsed).toBeGreaterThanOrEqual(100);
			expect(elapsed).toBeLessThan(150);
		});

		test("should return timing result on stop", async () => {
			const timer = new Timer("stopTest");

			await new Promise((resolve) => setTimeout(resolve, 50));
			const result = timer.stop();

			expect(result.operation).toBe("stopTest");
			expect(result.durationMs).toBeGreaterThanOrEqual(50);
			expect(result.startTime).toBeLessThanOrEqual(result.endTime);
			expect(result.endTime - result.startTime).toEqual(result.durationMs);
		});

		test("should return correct elapsed time without stopping", async () => {
			const timer = new Timer("elapsedTest");

			await new Promise((resolve) => setTimeout(resolve, 50));
			const elapsed1 = timer.elapsed();

			await new Promise((resolve) => setTimeout(resolve, 50));
			const elapsed2 = timer.elapsed();

			expect(elapsed1).toBeGreaterThanOrEqual(50);
			expect(elapsed2).toBeGreaterThanOrEqual(100);
			expect(elapsed2).toBeGreaterThan(elapsed1);
		});

		test("should measure multiple operations independently", async () => {
			const timer1 = new Timer("op1");
			const timer2 = new Timer("op2");

			await new Promise((resolve) => setTimeout(resolve, 50));
			const result1 = timer1.stop();

			await new Promise((resolve) => setTimeout(resolve, 50));
			const result2 = timer2.stop();

			expect(result1.durationMs).toBeLessThan(result2.durationMs);
			expect(result1.operation).toBe("op1");
			expect(result2.operation).toBe("op2");
		});
	});
});
