/**
 * @fileoverview Tests for GitHub error mapping helper
 *
 * Tests error mapping, rate limit detection, and GitHub-specific
 * error handling utilities.
 */

import { RequestError } from "@octokit/request-error";
import { describe, expect, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import { ErrorCode } from "@/errors/base-error";
import { GithubErrorHelper } from "@/errors/helpers/github-error.helper";

describe("GithubErrorHelper", () => {
	const helper = new GithubErrorHelper();

	describe("RequestError mapping", () => {
		test("should map 404 RequestError to NotFound", () => {
			const error = new RequestError("Not Found", StatusCodes.NOT_FOUND, {
				request: {
					method: "GET",
					url: "https://api.github.com/repos/test/test",
					headers: {},
				},
				response: {
					status: StatusCodes.NOT_FOUND,
					url: "https://api.github.com/repos/test/test",
					headers: {},
					data: {},
				},
			});

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.GithubNotFound);
			expect(mapped.message).toContain("Not Found");
		});

		test("should map 401 RequestError to Unauthorized", () => {
			const error = new RequestError("Unauthorized", StatusCodes.UNAUTHORIZED, {
				request: {
					method: "GET",
					url: "https://api.github.com/repos/test/test",
					headers: {},
				},
				response: {
					status: StatusCodes.UNAUTHORIZED,
					url: "https://api.github.com/repos/test/test",
					headers: {},
					data: {},
				},
			});

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.GithubUnauthorized);
		});

		test("should map 403 RequestError to Forbidden", () => {
			const error = new RequestError("Forbidden", StatusCodes.FORBIDDEN, {
				request: {
					method: "GET",
					url: "https://api.github.com/repos/test/test",
					headers: {},
				},
				response: {
					status: StatusCodes.FORBIDDEN,
					url: "https://api.github.com/repos/test/test",
					headers: {},
					data: {},
				},
			});

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.GithubForbidden);
		});

		test("should detect rate limit from error message", () => {
			const error = new Error("API rate limit exceeded");

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
		});

		test("should detect rate limit from response headers", () => {
			const error = new RequestError("Rate limited", StatusCodes.FORBIDDEN, {
				request: {
					method: "GET",
					url: "https://api.github.com/repos/test/test",
					headers: {},
				},
				response: {
					status: StatusCodes.FORBIDDEN,
					url: "https://api.github.com/repos/test/test",
					headers: {
						"x-ratelimit-remaining": "0",
					},
					data: {},
				},
			});

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
		});

		test("should map 500+ RequestError to ServerError", () => {
			const error = new RequestError("Internal Server Error", StatusCodes.INTERNAL_SERVER_ERROR, {
				request: {
					method: "GET",
					url: "https://api.github.com/repos/test/test",
					headers: {},
				},
				response: {
					status: StatusCodes.INTERNAL_SERVER_ERROR,
					url: "https://api.github.com/repos/test/test",
					headers: {},
					data: {},
				},
			});

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.GithubServerError);
		});

		test("should handle generic GitHub API RequestError", () => {
			const error = new RequestError("Bad request", StatusCodes.BAD_REQUEST, {
				request: {
					method: "GET",
					url: "https://api.github.com/repos/test/test",
					headers: {},
				},
				response: {
					status: StatusCodes.BAD_REQUEST,
					url: "https://api.github.com/repos/test/test",
					headers: {},
					data: {},
				},
			});

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.GithubApiError);
		});
	});

	describe("Error handling", () => {
		test("should handle unknown Error instances", () => {
			const error = new Error("Unknown error");

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.UnknownError);
			expect(mapped.message).toContain("Unknown error");
		});

		test("should preserve error context", () => {
			const error = new RequestError("Test error", StatusCodes.NOT_FOUND, {
				request: {
					method: "GET",
					url: "https://api.github.com/repos/test/test",
					headers: {},
				},
				response: {
					status: StatusCodes.NOT_FOUND,
					url: "https://api.github.com/repos/test/test",
					headers: {},
					data: {},
				},
			});

			const context = {
				operation: "GitHub.getFile",
				metadata: { path: "test.md", repo: "test/repo" },
			};

			const mapped = helper.mapError(error, context);

			expect(mapped.context.operation).toBe("GitHub.getFile");
			expect(mapped.context.metadata).toEqual(
				expect.objectContaining({ path: "test.md", repo: "test/repo" }),
			);
		});

		test("should handle RequestError from Octokit", () => {
			const requestError = new RequestError("Not found", StatusCodes.NOT_FOUND, {
				request: {
					method: "GET",
					url: "https://api.github.com/repos/test/test",
					headers: {},
				},
				response: {
					status: StatusCodes.NOT_FOUND,
					url: "https://api.github.com/repos/test/test",
					headers: {},
					data: {},
				},
			});

			const mapped = helper.mapError(requestError, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.GithubNotFound);
		});

		test("should detect rate limit from various error message patterns", () => {
			const patterns = [
				"rate limit exceeded",
				"API rate limit",
				"429 Too Many Requests",
				"too many requests",
			];

			patterns.forEach((message) => {
				const error = new Error(message);
				const mapped = helper.mapError(error, { operation: "test" });

				expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
			});
		});

		test("should handle errors without status code", () => {
			const error = new Error("Network error");

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.UnknownError);
		});

		test("should include original error message in mapped error", () => {
			const error = new RequestError("Specific error details", StatusCodes.BAD_REQUEST, {
				request: {
					method: "GET",
					url: "https://api.github.com/repos/test/test",
					headers: {},
				},
				response: {
					status: StatusCodes.BAD_REQUEST,
					url: "https://api.github.com/repos/test/test",
					headers: {},
					data: {},
				},
			});

			const mapped = helper.mapError(error, { operation: "test" });

			expect(mapped.message).toContain("Specific error details");
		});
	});
});
