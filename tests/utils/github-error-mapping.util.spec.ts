/**
 * @fileoverview Tests for the GitHub error mapping utility.
 *
 * This test suite verifies that the GitHub error mapping utility correctly
 * transforms Octokit RequestError instances to internal error codes based on
 * HTTP status codes and error messages.
 */

import { RequestError } from "@octokit/request-error";
import { beforeAll, describe, expect, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import { ErrorCode } from "@/errors/base.error";
import { createGitHubErrorMap } from "@/utils/";

describe("createGitHubErrorMap", () => {
	let errorMap: NonNullable<ReturnType<typeof createGitHubErrorMap>>;

	beforeAll(() => {
		const map = createGitHubErrorMap();

		if (map == null) throw new Error("Error map should not be null or undefined");

		errorMap = map;
	});

	test("should create error map with RequestError mapping", () => {
		expect(errorMap.has("RequestError")).toBe(true);
	});

	test(`should transform UNAUTHORIZED status to ${ErrorCode.GithubUnauthorized}`, () => {
		const requestError = new RequestError("Unauthorized", StatusCodes.UNAUTHORIZED, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.GithubUnauthorized);
	});

	test(`should transform NOT_FOUND status to ${ErrorCode.GithubNotFound}`, () => {
		const requestError = new RequestError("Not Found", StatusCodes.NOT_FOUND, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.GithubNotFound);
	});

	test(`should transform FORBIDDEN with rate limit message to ${ErrorCode.RateLimitExceeded}`, () => {
		const requestError = new RequestError("API rate limit exceeded", StatusCodes.FORBIDDEN, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.RateLimitExceeded);
	});

	test(`should transform FORBIDDEN without rate limit message to ${ErrorCode.GithubForbidden}`, () => {
		const requestError = new RequestError("Forbidden", StatusCodes.FORBIDDEN, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.GithubForbidden);
	});

	test(`should transform server errors to ${ErrorCode.GithubServerError}`, () => {
		const statuses = [
			StatusCodes.INTERNAL_SERVER_ERROR,
			StatusCodes.BAD_GATEWAY,
			StatusCodes.SERVICE_UNAVAILABLE,
			StatusCodes.GATEWAY_TIMEOUT,
		];

		for (const status of statuses) {
			const requestError = new RequestError("Server Error", status, {
				request: { method: "GET", url: "/test", headers: {} },
			});

			const mapping = errorMap.get("RequestError");
			const result = mapping?.transform?.(requestError);

			expect(result?.code).toBe(ErrorCode.GithubServerError);
		}
	});

	test(`should transform unknown status to ${ErrorCode.GithubApiError} with metadata`, () => {
		const requestError = new RequestError("Unknown Error", StatusCodes.IM_A_TEAPOT, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.GithubApiError);
		expect(result?.metadata?.["networkError"]).toBe(false);
		expect(result?.metadata?.["originalError"]).toBe("Unknown Error");
	});
});
