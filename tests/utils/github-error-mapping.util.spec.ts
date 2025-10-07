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

	test("should transform UNAUTHORIZED status to GITHUB_UNAUTHORIZED", () => {
		const requestError = new RequestError("Unauthorized", StatusCodes.UNAUTHORIZED, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.GITHUB_UNAUTHORIZED);
	});

	test("should transform NOT_FOUND status to GITHUB_NOT_FOUND", () => {
		const requestError = new RequestError("Not Found", StatusCodes.NOT_FOUND, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.GITHUB_NOT_FOUND);
	});

	test("should transform FORBIDDEN with rate limit message to GITHUB_RATE_LIMITED", () => {
		const requestError = new RequestError("API rate limit exceeded", StatusCodes.FORBIDDEN, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.GITHUB_RATE_LIMITED);
	});

	test("should transform FORBIDDEN without rate limit message to GITHUB_FORBIDDEN", () => {
		const requestError = new RequestError("Forbidden", StatusCodes.FORBIDDEN, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.GITHUB_FORBIDDEN);
	});

	test("should transform server errors to GITHUB_SERVER_ERROR", () => {
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

			expect(result?.code).toBe(ErrorCode.GITHUB_SERVER_ERROR);
		}
	});

	test("should transform unknown status to GITHUB_API_ERROR with metadata", () => {
		const requestError = new RequestError("Unknown Error", StatusCodes.IM_A_TEAPOT, {
			request: { method: "GET", url: "/test", headers: {} },
		});

		const mapping = errorMap.get("RequestError");
		const result = mapping?.transform?.(requestError);

		expect(result?.code).toBe(ErrorCode.GITHUB_API_ERROR);
		expect(result?.metadata?.["networkError"]).toBe(false);
		expect(result?.metadata?.["originalError"]).toBe("Unknown Error");
	});
});
