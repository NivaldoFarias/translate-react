import { RequestError } from "@octokit/request-error";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import { DEFAULT_BACKOFF_CONFIG, withExponentialBackoff } from "@/utils/backoff.util";

function createRequestError({ message, status }: { message: string; status: number }) {
	return new RequestError(message, status, {
		request: {
			headers: {},
			method: "GET",
			url: "https://api.example.com",
		},
	});
}

describe("backoff.util", () => {
	describe("withExponentialBackoff", () => {
		beforeEach(() => {
			mock.restore();
		});

		afterEach(() => {
			mock.restore();
		});

		test("should return result when operation succeeds on first attempt", async () => {
			const operation = mock(() => Promise.resolve("success"));

			const result = await withExponentialBackoff(operation);

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(1);
		});

		test("should retry on retryable errors and eventually succeed", async () => {
			const error = createRequestError({
				message: "Rate limit exceeded",
				status: StatusCodes.TOO_MANY_REQUESTS,
			});

			let attemptCount = 0;
			const operation = mock(() => {
				attemptCount++;
				if (attemptCount < 3) {
					return Promise.reject(error);
				}
				return Promise.resolve("success after retries");
			});

			const result = await withExponentialBackoff(operation, {
				initialDelay: 10,
				maxRetries: 5,
				jitter: false,
			});

			expect(result).toBe("success after retries");
			expect(operation).toHaveBeenCalledTimes(3);
		});

		test("should throw error after max retries exceeded", () => {
			const error = createRequestError({
				message: "Server error",
				status: StatusCodes.INTERNAL_SERVER_ERROR,
			});

			const operation = mock(() => Promise.reject(error));

			expect(
				withExponentialBackoff(operation, {
					initialDelay: 10,
					maxRetries: 2,
					jitter: false,
				}),
			).rejects.toThrow("Server error");

			expect(operation).toHaveBeenCalledTimes(3);
		});

		test("should not retry on non-retryable errors", () => {
			const error = createRequestError({
				message: "Bad request",
				status: StatusCodes.BAD_REQUEST,
			});

			const operation = mock(() => Promise.reject(error));

			expect(
				withExponentialBackoff(operation, {
					initialDelay: 10,
					maxRetries: 5,
					jitter: false,
				}),
			).rejects.toThrow("Bad request");

			expect(operation).toHaveBeenCalledTimes(1);
		});

		test("should use exponential backoff with correct delays", () => {
			const error = createRequestError({
				message: "Rate limit",
				status: StatusCodes.TOO_MANY_REQUESTS,
			});

			const operation = mock(() => Promise.reject(error));
			const startTime = Date.now();

			expect(
				withExponentialBackoff(operation, {
					initialDelay: 100,
					maxDelay: 1000,
					maxRetries: 2,
					multiplier: 2,
					jitter: false,
				}),
			).rejects.toThrow("Rate limit");

			const elapsedTime = Date.now() - startTime;

			expect(elapsedTime).toBeGreaterThanOrEqual(280);
			expect(operation).toHaveBeenCalledTimes(3);
		});

		test("should cap delays at maxDelay", () => {
			const error = createRequestError({
				message: "Server error",
				status: StatusCodes.SERVICE_UNAVAILABLE,
			});

			const operation = mock(() => Promise.reject(error));

			expect(
				withExponentialBackoff(operation, {
					initialDelay: 1000,
					maxDelay: 1500,
					maxRetries: 3,
					multiplier: 3,
					jitter: false,
				}),
			).rejects.toThrow("Server error");

			expect(operation).toHaveBeenCalledTimes(4);
		});

		test("should handle network timeout errors as retryable", async () => {
			const timeoutError = new Error("Connection timeout");

			let attemptCount = 0;
			const operation = mock(() => {
				attemptCount++;
				if (attemptCount < 2) {
					return Promise.reject(timeoutError);
				}
				return Promise.resolve("success");
			});

			const result = await withExponentialBackoff(operation, {
				initialDelay: 10,
				maxRetries: 3,
				jitter: false,
			});

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(2);
		});

		test("should use default config when no config provided", async () => {
			const operation = mock(() => Promise.resolve("success"));

			const result = await withExponentialBackoff(operation);

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(1);
		});

		test("should merge partial config with defaults", () => {
			const error = createRequestError({
				message: "Rate limit",
				status: StatusCodes.TOO_MANY_REQUESTS,
			});

			const operation = mock(() => Promise.reject(error));

			expect(
				withExponentialBackoff(operation, {
					maxRetries: 1,
				}),
			).rejects.toThrow("Rate limit");

			expect(operation).toHaveBeenCalledTimes(2);
		});

		test("should handle 429 status code as retryable", async () => {
			const rateLimitError = createRequestError({
				message: "Rate limit exceeded",
				status: StatusCodes.TOO_MANY_REQUESTS,
			});

			let attemptCount = 0;
			const operation = mock(() => {
				attemptCount++;
				if (attemptCount < 2) {
					return Promise.reject(rateLimitError);
				}
				return Promise.resolve("success");
			});

			const result = await withExponentialBackoff(operation, {
				initialDelay: 10,
				maxRetries: 3,
				jitter: false,
			});

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(2);
		});

		test("should handle 500+ status codes as retryable", async () => {
			const serverError = createRequestError({
				message: "Internal server error",
				status: StatusCodes.INTERNAL_SERVER_ERROR,
			});

			let attemptCount = 0;
			const operation = mock(() => {
				attemptCount++;
				if (attemptCount < 2) {
					return Promise.reject(serverError);
				}
				return Promise.resolve("success");
			});

			const result = await withExponentialBackoff(operation, {
				initialDelay: 10,
				maxRetries: 3,
				jitter: false,
			});

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(2);
		});

		test("should not retry on 401 unauthorized", () => {
			const authError = createRequestError({
				message: "Unauthorized",
				status: StatusCodes.UNAUTHORIZED,
			});

			const operation = mock(() => Promise.reject(authError));

			expect(
				withExponentialBackoff(operation, {
					initialDelay: 10,
					maxRetries: 5,
					jitter: false,
				}),
			).rejects.toThrow("Unauthorized");

			expect(operation).toHaveBeenCalledTimes(1);
		});

		test("should not retry on 404 not found", () => {
			const notFoundError = createRequestError({
				message: "Not found",
				status: StatusCodes.NOT_FOUND,
			});

			const operation = mock(() => Promise.reject(notFoundError));

			expect(
				withExponentialBackoff(operation, {
					initialDelay: 10,
					maxRetries: 5,
					jitter: false,
				}),
			).rejects.toThrow("Not found");

			expect(operation).toHaveBeenCalledTimes(1);
		});

		test("should apply jitter when enabled", () => {
			const error = createRequestError({
				message: "Rate limit",
				status: StatusCodes.TOO_MANY_REQUESTS,
			});

			const operation = mock(() => Promise.reject(error));
			const delays: number[] = [];
			const startTimes: number[] = [];

			for (let i = 0; i < 3; i++) {
				operation.mockClear();
				const startTime = Date.now();
				startTimes.push(startTime);

				expect(
					withExponentialBackoff(operation, {
						initialDelay: 100,
						maxRetries: 1,
						multiplier: 2,
						jitter: true,
					}),
				).rejects.toThrow();

				delays.push(Date.now() - startTime);
			}

			for (const delay of delays) {
				expect(delay).toBeGreaterThanOrEqual(70);
				expect(delay).toBeLessThanOrEqual(135);
			}
		});
	});

	describe("DEFAULT_BACKOFF_CONFIG", () => {
		test("should have sensible default values", () => {
			expect(DEFAULT_BACKOFF_CONFIG).toEqual({
				initialDelay: 1000,
				maxDelay: 60_000,
				maxRetries: 5,
				multiplier: 2,
				jitter: true,
			});
		});
	});
});
