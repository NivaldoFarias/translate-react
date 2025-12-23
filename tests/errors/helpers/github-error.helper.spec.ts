import { RequestError } from "@octokit/request-error";
import { describe, expect, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import { ErrorCode } from "@/errors/base-error";
import { mapGithubError } from "@/errors/helpers/github-error.helper";

describe("mapGithubError", () => {
	describe("RequestError mapping", () => {
		test.each([
			[StatusCodes.NOT_FOUND, "Not Found", ErrorCode.GithubNotFound],
			[StatusCodes.UNAUTHORIZED, "Unauthorized", ErrorCode.GithubUnauthorized],
			[StatusCodes.FORBIDDEN, "Forbidden", ErrorCode.GithubForbidden],
		])(
			"should map %d status to %s error code when RequestError occurs",
			(status, message, expectedCode) => {
				const error = new RequestError(message, status, {
					request: {
						method: "GET",
						url: "https://api.github.com/repos/test/test",
						headers: {},
					},
					response: {
						status,
						url: "https://api.github.com/repos/test/test",
						headers: {},
						data: {},
					},
				});

				const mapped = mapGithubError(error, { operation: "test" });

				expect(mapped.code).toBe(expectedCode);
				if (expectedCode === ErrorCode.GithubNotFound) {
					expect(mapped.message).toContain(message);
				}
			},
		);

		test("should detect rate limit from error message", () => {
			const error = new Error("API rate limit exceeded");

			const mapped = mapGithubError(error, { operation: "test" });

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

			const mapped = mapGithubError(error, { operation: "test" });

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

			const mapped = mapGithubError(error, { operation: "test" });

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

			const mapped = mapGithubError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.GithubApiError);
		});
	});

	describe("Error handling", () => {
		test("should handle unknown Error instances", () => {
			const error = new Error("Unknown error");

			const mapped = mapGithubError(error, { operation: "test" });

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

			const mapped = mapGithubError(error, context);

			expect(mapped.operation).toBe("GitHub.getFile");
			expect(mapped.metadata?.path).toBe(context.metadata.path);
			expect(mapped.metadata?.repo).toBe(context.metadata.repo);
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

			const mapped = mapGithubError(requestError, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.GithubNotFound);
		});

		test("should detect rate limit from various error message patterns", () => {
			const patterns = [
				"rate limit exceeded",
				"API rate limit",
				"429 Too Many Requests",
				"too many requests",
			];

			for (const message of patterns) {
				const error = new Error(message);
				const mapped = mapGithubError(error, { operation: "test" });

				expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
			}
		});

		test("should handle errors without status code", () => {
			const error = new Error("Network error");

			const mapped = mapGithubError(error, { operation: "test" });

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

			const mapped = mapGithubError(error, { operation: "test" });

			expect(mapped.message).toContain("Specific error details");
		});

		test("should handle empty context", () => {
			const error = new Error("Test error");
			const context = { operation: "" };

			const mapped = mapGithubError(error, context);

			expect(mapped.code).toBe(ErrorCode.UnknownError);
			expect(mapped.operation).toBe("");
		});

		test("should handle missing response headers in RequestError", () => {
			const error = new RequestError("Error", StatusCodes.BAD_REQUEST, {
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

			const mapped = mapGithubError(error, { operation: "test" });

			expect(mapped.code).toBe(ErrorCode.GithubApiError);
		});
	});
});
