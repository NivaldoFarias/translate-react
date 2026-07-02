import { RequestError } from "@octokit/request-error";
import { describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import {
	getRetryAfterMs,
	isForbiddenError,
	withRetry,
	wrapMethodWithFallback,
} from "@/app/clients";
import {
	RATE_LIMIT_BUFFER_MS,
	RATE_LIMIT_MAX_DELAY_MS,
} from "@/app/clients/octokit/octokit.constants";
import { MS_PER_SECOND } from "@/app/constants";

function createRequestError(
	status: number,
	message = "API Error",
	responseHeaders?: Record<string, string>,
) {
	return new RequestError(message, status, {
		request: { method: "GET", url: "https://api.github.com/test", headers: {} },
		response:
			responseHeaders ?
				{
					status,
					url: "https://api.github.com/test",
					headers: responseHeaders,
					data: null,
				}
			:	undefined,
	});
}

describe("octokit.client", () => {
	describe("isForbiddenError", () => {
		test("returns true for 403 RequestError", () => {
			const error = createRequestError(StatusCodes.FORBIDDEN);

			expect(isForbiddenError(error)).toBe(true);
		});

		test("returns false for non-403 RequestError", () => {
			const error = createRequestError(StatusCodes.NOT_FOUND);

			expect(isForbiddenError(error)).toBe(false);
		});

		test("returns false for generic Error", () => {
			const error = new Error("Something went wrong");

			expect(isForbiddenError(error)).toBe(false);
		});

		test("returns false for non-error values", () => {
			expect(isForbiddenError(null)).toBe(false);
			expect(isForbiddenError(undefined)).toBe(false);
			expect(isForbiddenError("error")).toBe(false);
			expect(isForbiddenError({ status: 403 })).toBe(false);
		});

		test.each([
			[StatusCodes.BAD_REQUEST, false],
			[StatusCodes.UNAUTHORIZED, false],
			[StatusCodes.FORBIDDEN, true],
			[StatusCodes.NOT_FOUND, false],
			[StatusCodes.INTERNAL_SERVER_ERROR, false],
		])("returns %s for status code %d", (status, expected) => {
			const error = createRequestError(status);

			expect(isForbiddenError(error)).toBe(expected);
		});
	});

	describe("wrapMethodWithFallback", () => {
		test("returns result from primary method on success", async () => {
			const primaryMethod = mock(() => Promise.resolve({ data: "primary-result" }));
			const fallbackMethod = mock(() => Promise.resolve({ data: "fallback-result" }));

			const wrapped = wrapMethodWithFallback(primaryMethod, fallbackMethod, "repos", "get");

			const result = await wrapped();

			expect(result).toEqual({ data: "primary-result" });
			expect(primaryMethod).toHaveBeenCalledTimes(1);
			expect(fallbackMethod).not.toHaveBeenCalled();
		});

		test("retries with fallback method on 403 error", async () => {
			const forbiddenError = createRequestError(StatusCodes.FORBIDDEN);
			const primaryMethod = mock(() => Promise.reject(forbiddenError));
			const fallbackMethod = mock(() => Promise.resolve({ data: "fallback-result" }));

			const wrapped = wrapMethodWithFallback(primaryMethod, fallbackMethod, "repos", "get");

			const result = await wrapped();

			expect(result).toEqual({ data: "fallback-result" });
			expect(primaryMethod).toHaveBeenCalledTimes(1);
			expect(fallbackMethod).toHaveBeenCalledTimes(1);
		});

		test("propagates non-403 errors without retry", () => {
			const notFoundError = createRequestError(StatusCodes.NOT_FOUND);
			const primaryMethod = mock(() => Promise.reject(notFoundError));
			const fallbackMethod = mock(() => Promise.resolve({ data: "fallback-result" }));

			const wrapped = wrapMethodWithFallback(primaryMethod, fallbackMethod, "repos", "get");

			expect(wrapped()).rejects.toThrow(notFoundError);
			expect(fallbackMethod).not.toHaveBeenCalled();
		});

		test("propagates 403 error when no fallback is configured", () => {
			const forbiddenError = createRequestError(StatusCodes.FORBIDDEN);
			const primaryMethod = mock(() => Promise.reject(forbiddenError));

			const wrapped = wrapMethodWithFallback(primaryMethod, undefined, "repos", "get");

			expect(wrapped()).rejects.toThrow(forbiddenError);
		});

		test("passes arguments to primary method", async () => {
			const primaryMethod = mock(() => Promise.resolve({ data: "result" }));

			const wrapped = wrapMethodWithFallback(primaryMethod, undefined, "repos", "get");

			await wrapped({ owner: "test", repo: "repo" } as never);

			expect(primaryMethod).toHaveBeenCalledWith({ owner: "test", repo: "repo" });
		});

		test("passes arguments to fallback method on retry", async () => {
			const forbiddenError = createRequestError(StatusCodes.FORBIDDEN);
			const primaryMethod = mock(() => Promise.reject(forbiddenError));
			const fallbackMethod = mock(() => Promise.resolve({ data: "result" }));

			const wrapped = wrapMethodWithFallback(primaryMethod, fallbackMethod, "repos", "get");

			await wrapped({ owner: "test", repo: "repo" } as never);

			expect(fallbackMethod).toHaveBeenCalledWith({ owner: "test", repo: "repo" });
		});

		test("propagates generic errors without retry", () => {
			const genericError = new Error("Network failure");
			const primaryMethod = mock(() => Promise.reject(genericError));
			const fallbackMethod = mock(() => Promise.resolve({ data: "fallback-result" }));

			const wrapped = wrapMethodWithFallback(primaryMethod, fallbackMethod, "repos", "get");

			expect(wrapped()).rejects.toThrow(genericError);
			expect(fallbackMethod).not.toHaveBeenCalled();
		});
	});

	describe("getRetryAfterMs", () => {
		test("returns delay from x-ratelimit-reset Unix timestamp", () => {
			const resetSeconds = Math.floor(Date.now() / MS_PER_SECOND) + 30;
			const error = createRequestError(StatusCodes.TOO_MANY_REQUESTS, "rate limited", {
				"x-ratelimit-reset": String(resetSeconds),
				"x-ratelimit-limit": "5000",
				"x-ratelimit-remaining": "0",
			});

			const delayMs = getRetryAfterMs(error);

			expect(delayMs).toBeDefined();
			expect(delayMs).toBeGreaterThan(0);
			expect(delayMs).toBeLessThanOrEqual(30 * MS_PER_SECOND + RATE_LIMIT_BUFFER_MS);
		});

		test("returns undefined when reset header is absent", () => {
			const error = createRequestError(StatusCodes.TOO_MANY_REQUESTS);

			expect(getRetryAfterMs(error)).toBeUndefined();
		});

		test("returns undefined when reset delay exceeds the max wait window", () => {
			const resetSeconds =
				Math.floor(Date.now() / MS_PER_SECOND) +
				Math.ceil(RATE_LIMIT_MAX_DELAY_MS / MS_PER_SECOND) +
				60;
			const error = createRequestError(StatusCodes.TOO_MANY_REQUESTS, "rate limited", {
				"x-ratelimit-reset": String(resetSeconds),
			});

			expect(getRetryAfterMs(error)).toBeUndefined();
		});

		test("returns undefined when reset time is already in the past", () => {
			const resetSeconds = Math.floor(Date.now() / MS_PER_SECOND) - 120;
			const error = createRequestError(StatusCodes.TOO_MANY_REQUESTS, "rate limited", {
				"x-ratelimit-reset": String(resetSeconds),
			});

			expect(getRetryAfterMs(error)).toBeUndefined();
		});
	});

	describe("withRetry", () => {
		test("returns result on first successful attempt", async () => {
			const fn = mock(() => Promise.resolve({ data: "success" }));

			const result = await withRetry(fn, "test.operation");

			expect(result).toEqual({ data: "success" });
			expect(fn).toHaveBeenCalledTimes(1);
		});

		test("retries on 5xx server error and succeeds", async () => {
			const serverError = createRequestError(StatusCodes.INTERNAL_SERVER_ERROR);
			let callCount = 0;
			const fn = mock(() => {
				callCount++;
				if (callCount < 2) return Promise.reject(serverError);
				return Promise.resolve({ data: "recovered" });
			});

			const result = await withRetry(fn, "test.operation", { retries: 3, minTimeout: 10 });

			expect(result).toEqual({ data: "recovered" });
			expect(fn).toHaveBeenCalledTimes(2);
		});

		test("retries on 429 rate limit error and succeeds", async () => {
			const rateLimitError = createRequestError(StatusCodes.TOO_MANY_REQUESTS);
			let callCount = 0;
			const fn = mock(() => {
				callCount++;
				if (callCount < 2) return Promise.reject(rateLimitError);
				return Promise.resolve({ data: "recovered" });
			});

			const result = await withRetry(fn, "test.operation", { retries: 3, minTimeout: 10 });

			expect(result).toEqual({ data: "recovered" });
			expect(fn).toHaveBeenCalledTimes(2);
		});

		test("waits for x-ratelimit-reset before retrying 429", async () => {
			const resetSeconds = Math.floor(Date.now() / MS_PER_SECOND) + 1;
			const rateLimitError = createRequestError(StatusCodes.TOO_MANY_REQUESTS, "rate limited", {
				"x-ratelimit-reset": String(resetSeconds),
				"x-ratelimit-limit": "5000",
				"x-ratelimit-remaining": "0",
			});
			let callCount = 0;
			const fn = mock(() => {
				callCount++;
				if (callCount < 2) return Promise.reject(rateLimitError);
				return Promise.resolve({ data: "recovered" });
			});

			const start = Date.now();
			const result = await withRetry(fn, "test.rateLimitReset", { retries: 1, minTimeout: 10 });
			const elapsed = Date.now() - start;

			expect(result).toEqual({ data: "recovered" });
			expect(fn).toHaveBeenCalledTimes(2);
			expect(elapsed).toBeGreaterThanOrEqual(RATE_LIMIT_BUFFER_MS);
		});

		test("retries on network error (ECONNRESET) and succeeds", async () => {
			const networkError = new Error("connect ECONNRESET");
			let callCount = 0;
			const fn = mock(() => {
				callCount++;
				if (callCount < 2) return Promise.reject(networkError);
				return Promise.resolve({ data: "recovered" });
			});

			const result = await withRetry(fn, "test.operation", { retries: 3, minTimeout: 10 });

			expect(result).toEqual({ data: "recovered" });
			expect(fn).toHaveBeenCalledTimes(2);
		});

		test("does not retry on 4xx client error (except 429)", () => {
			const notFoundError = createRequestError(StatusCodes.NOT_FOUND);
			const fn = mock(() => Promise.reject(notFoundError));

			expect(withRetry(fn, "test.operation", { retries: 3, minTimeout: 10 })).rejects.toThrow();
			expect(fn).toHaveBeenCalledTimes(1);
		});

		test("does not retry on 401 unauthorized error", () => {
			const unauthorizedError = createRequestError(StatusCodes.UNAUTHORIZED);
			const fn = mock(() => Promise.reject(unauthorizedError));

			expect(withRetry(fn, "test.operation", { retries: 3, minTimeout: 10 })).rejects.toThrow();
			expect(fn).toHaveBeenCalledTimes(1);
		});

		test("exhausts retries on persistent server error", () => {
			const serverError = createRequestError(StatusCodes.INTERNAL_SERVER_ERROR);
			const fn = mock(() => Promise.reject(serverError));

			expect(withRetry(fn, "test.operation", { retries: 2, minTimeout: 10 })).rejects.toThrow();
			expect(fn).toHaveBeenCalledTimes(3);
		});

		test.each([
			["ECONNRESET", true],
			["ETIMEDOUT", true],
			["ENOTFOUND", true],
			["ECONNREFUSED", true],
			["EAI_AGAIN", true],
			["EPERM", false],
			["ENOENT", false],
		])("handles network error pattern %s with retry=%s", async (pattern, shouldRetry) => {
			const networkError = new Error(`connect ${pattern}`);
			let callCount = 0;
			const fn = mock(() => {
				callCount++;
				if (callCount < 2) return Promise.reject(networkError);
				return Promise.resolve({ data: "recovered" });
			});

			if (shouldRetry) {
				const result = await withRetry(fn, "test.operation", { retries: 3, minTimeout: 10 });
				expect(result).toEqual({ data: "recovered" });
				expect(fn).toHaveBeenCalledTimes(2);
			} else {
				expect(withRetry(fn, "test.operation", { retries: 3, minTimeout: 10 })).rejects.toThrow();
				expect(fn).toHaveBeenCalledTimes(1);
			}
		});

		test.each([
			[StatusCodes.INTERNAL_SERVER_ERROR, true],
			[StatusCodes.BAD_GATEWAY, true],
			[StatusCodes.SERVICE_UNAVAILABLE, true],
			[StatusCodes.GATEWAY_TIMEOUT, true],
			[StatusCodes.TOO_MANY_REQUESTS, true],
			[StatusCodes.BAD_REQUEST, false],
			[StatusCodes.UNAUTHORIZED, false],
			[StatusCodes.FORBIDDEN, false],
			[StatusCodes.NOT_FOUND, false],
		])("handles status code %d with retry=%s", async (status, shouldRetry) => {
			const error = createRequestError(status);
			let callCount = 0;
			const fn = mock(() => {
				callCount++;
				if (callCount < 2) return Promise.reject(error);
				return Promise.resolve({ data: "recovered" });
			});

			if (shouldRetry) {
				const result = await withRetry(fn, "test.operation", { retries: 3, minTimeout: 10 });
				expect(result).toEqual({ data: "recovered" });
				expect(fn).toHaveBeenCalledTimes(2);
			} else {
				expect(withRetry(fn, "test.operation", { retries: 3, minTimeout: 10 })).rejects.toThrow();
				expect(fn).toHaveBeenCalledTimes(1);
			}
		});
	});
});
