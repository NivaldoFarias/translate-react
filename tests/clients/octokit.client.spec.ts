import { RequestError } from "@octokit/request-error";
import { describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import type { OctokitMethod } from "@/clients/octokit.client";

import { isForbiddenError, wrapMethodWithFallback } from "@/clients/octokit.client";

/** Creates a RequestError with the specified status code */
function createRequestError(status: number, message = "API Error") {
	return new RequestError(message, status, {
		request: { method: "GET", url: "https://api.github.com/test", headers: {} },
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

			const wrapped = wrapMethodWithFallback(
				primaryMethod as OctokitMethod,
				fallbackMethod as OctokitMethod,
				"repos",
				"get",
			);

			const result = await wrapped();

			expect(result).toEqual({ data: "primary-result" });
			expect(primaryMethod).toHaveBeenCalledTimes(1);
			expect(fallbackMethod).not.toHaveBeenCalled();
		});

		test("retries with fallback method on 403 error", async () => {
			const forbiddenError = createRequestError(StatusCodes.FORBIDDEN);
			const primaryMethod = mock(() => Promise.reject(forbiddenError));
			const fallbackMethod = mock(() => Promise.resolve({ data: "fallback-result" }));

			const wrapped = wrapMethodWithFallback(
				primaryMethod as OctokitMethod,
				fallbackMethod as OctokitMethod,
				"repos",
				"get",
			);

			const result = await wrapped();

			expect(result).toEqual({ data: "fallback-result" });
			expect(primaryMethod).toHaveBeenCalledTimes(1);
			expect(fallbackMethod).toHaveBeenCalledTimes(1);
		});

		test("propagates non-403 errors without retry", () => {
			const notFoundError = createRequestError(StatusCodes.NOT_FOUND);
			const primaryMethod = mock(() => Promise.reject(notFoundError));
			const fallbackMethod = mock(() => Promise.resolve({ data: "fallback-result" }));

			const wrapped = wrapMethodWithFallback(
				primaryMethod as OctokitMethod,
				fallbackMethod as OctokitMethod,
				"repos",
				"get",
			);

			expect(wrapped()).rejects.toThrow(notFoundError);
			expect(fallbackMethod).not.toHaveBeenCalled();
		});

		test("propagates 403 error when no fallback is configured", () => {
			const forbiddenError = createRequestError(StatusCodes.FORBIDDEN);
			const primaryMethod = mock(() => Promise.reject(forbiddenError));

			const wrapped = wrapMethodWithFallback(
				primaryMethod as OctokitMethod,
				undefined,
				"repos",
				"get",
			);

			expect(wrapped()).rejects.toThrow(forbiddenError);
		});

		test("passes arguments to primary method", async () => {
			const primaryMethod = mock(() => Promise.resolve({ data: "result" }));

			const wrapped = wrapMethodWithFallback(
				primaryMethod as OctokitMethod,
				undefined,
				"repos",
				"get",
			);

			await wrapped({ owner: "test", repo: "repo" } as never);

			expect(primaryMethod).toHaveBeenCalledWith({ owner: "test", repo: "repo" });
		});

		test("passes arguments to fallback method on retry", async () => {
			const forbiddenError = createRequestError(StatusCodes.FORBIDDEN);
			const primaryMethod = mock(() => Promise.reject(forbiddenError));
			const fallbackMethod = mock(() => Promise.resolve({ data: "result" }));

			const wrapped = wrapMethodWithFallback(
				primaryMethod as OctokitMethod,
				fallbackMethod as OctokitMethod,
				"repos",
				"get",
			);

			await wrapped({ owner: "test", repo: "repo" } as never);

			expect(fallbackMethod).toHaveBeenCalledWith({ owner: "test", repo: "repo" });
		});

		test("propagates generic errors without retry", () => {
			const genericError = new Error("Network failure");
			const primaryMethod = mock(() => Promise.reject(genericError));
			const fallbackMethod = mock(() => Promise.resolve({ data: "fallback-result" }));

			const wrapped = wrapMethodWithFallback(
				primaryMethod as OctokitMethod,
				fallbackMethod as OctokitMethod,
				"repos",
				"get",
			);

			expect(wrapped()).rejects.toThrow(genericError);
			expect(fallbackMethod).not.toHaveBeenCalled();
		});
	});
});
