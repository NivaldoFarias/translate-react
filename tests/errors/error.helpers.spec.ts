import { RequestError } from "@octokit/request-error";
import { describe, expect, test } from "bun:test";
import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";

import { ErrorCode, mapError } from "@/errors/";

describe("mapError", () => {
	describe("Github API errors", () => {
		describe("Octokit's RequestError mapping", () => {
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

					const mapped = mapError(error, "test");

					expect(mapped.code).toBe(expectedCode);
					if (expectedCode === ErrorCode.GithubNotFound) {
						expect(mapped.message).toContain(message);
					}
				},
			);

			test("should detect rate limit from error message", () => {
				const error = new Error("API rate limit exceeded");

				const mapped = mapError(error, "test");

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

				const mapped = mapError(error, "test");

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

				const mapped = mapError(error, "test");

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

				const mapped = mapError(error, "test");

				expect(mapped.code).toBe(ErrorCode.GithubApiError);
			});
		});

		describe("Error instance handling", () => {
			test("should preserve operation and metadata", () => {
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

				const mapped = mapError(error, "GitHub.getFile", {
					path: "test.md",
					repo: "test/repo",
				});

				expect(mapped.operation).toBe("GitHub.getFile");
				expect(mapped.metadata?.path).toBe("test.md");
				expect(mapped.metadata?.repo).toBe("test/repo");
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
					const mapped = mapError(error, "test");

					expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
				}
			});

			test("should handle errors without status code", () => {
				const error = new Error("Network error");

				const mapped = mapError(error, "test");

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

				const mapped = mapError(error, "test");

				expect(mapped.message).toContain("Specific error details");
			});

			test("should handle empty operation", () => {
				const error = new Error("Test error");

				const mapped = mapError(error, "");

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

				const mapped = mapError(error, "test");

				expect(mapped.code).toBe(ErrorCode.GithubApiError);
			});

			test("should handle uncast RequestError objects", () => {
				const error = {
					name: "HttpError",
					message: "Uncast RequestError",
					status: StatusCodes.NOT_FOUND,
					request: {
						method: "GET",
						url: "https://api.github.com/repos/test/test",
						headers: {},
					},
					response: {
						headers: {
							["x-github-request-id"]: "Uncast RequestError",
						},
					},
				};

				const mapped = mapError(error, "test");

				expect(mapped.code).toBe(ErrorCode.GithubNotFound);
				expect(mapped.message).toContain("Uncast RequestError");
				expect(mapped.operation).toBe("test");
				expect(mapped.metadata?.statusCode).toBe(StatusCodes.NOT_FOUND);
				expect(mapped.metadata?.requestId).toBe("Uncast RequestError");
			});
		});
	});

	describe("Openai/LLM API errors", () => {
		describe("APIError mapping", () => {
			test("should map APIError to LLMApiError", () => {
				const message = "Invalid request";
				const error = new APIError(StatusCodes.BAD_REQUEST, { message }, message, {});

				const mapped = mapError(error, "TranslatorService.callLanguageModel");

				expect(mapped.message).toContain("Invalid request");
			});

			test("should preserve error metadata", () => {
				const message = "Bad request";
				const error = new APIError(StatusCodes.BAD_REQUEST, { message }, message, {});

				const mapped = mapError(error, "TranslatorService.callLanguageModel", {
					model: "gpt-4",
					contentLength: 1500,
				});

				expect(mapped.operation).toBe("TranslatorService.callLanguageModel");
				expect(mapped.metadata?.model).toBe("gpt-4");
				expect(mapped.metadata?.contentLength).toBe(1500);
			});
		});

		describe("Error instance handling", () => {
			test.each([
				["rate limit exceeded", ErrorCode.RateLimitExceeded],
				["too many requests", ErrorCode.RateLimitExceeded],
				["429 error", ErrorCode.RateLimitExceeded],
				["quota exceeded", ErrorCode.RateLimitExceeded],
				["Unknown LLM error", ErrorCode.UnknownError],
			])("should detect rate limit when error message contains '%s'", (message, errorCode) => {
				const error = new Error(message);

				const mapped = mapError(error, "TranslatorService.callLanguageModel");

				expect(mapped.code).toBe(errorCode);
				expect(mapped.message).toContain(message);
			});

			describe("Non-Error object handling", () => {
				test("should handle string errors", () => {
					const error = "String error message";

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.message).toContain("String error message");
				});

				test("should handle null errors", () => {
					const error = null;

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.message).toBe("null");
				});

				test("should handle undefined errors", () => {
					const error = undefined;

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.message).toBe("undefined");
				});

				test("should handle object errors", () => {
					const error = { message: "Object error", code: 500 };

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.code).toBe(ErrorCode.UnknownError);
					expect(mapped.message).toContain("[object Object]");
				});

				test("should handle unknown Error instances", () => {
					const error = new Error("Unknown error");

					const mapped = mapError(error, "test");

					expect(mapped.code).toBe(ErrorCode.UnknownError);
					expect(mapped.message).toContain("Unknown error");
				});
			});

			describe("Context preservation", () => {
				test("should preserve metadata", () => {
					const error = new Error("Test error");

					const mapped = mapError(error, "TranslatorService.translateText", {
						model: "gpt-4",
						temperature: 0.7,
						maxTokens: 2000,
					});

					expect(mapped.metadata?.model).toBe("gpt-4");
					expect(mapped.metadata?.temperature).toBe(0.7);
					expect(mapped.metadata?.maxTokens).toBe(2000);
				});

				test("should handle missing metadata gracefully", () => {
					const error = new Error("Test error");

					const mapped = mapError(error, "TranslatorService.translateText");

					expect(mapped.operation).toBe("TranslatorService.translateText");
					expect(mapped.metadata).toBeDefined();
				});
			});

			describe("Edge Cases", () => {
				test("should handle APIError with empty message", () => {
					const message = "";
					const error = new APIError(StatusCodes.BAD_REQUEST, { message }, message, {});

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.code).toBe(ErrorCode.LLMApiError);
					expect(mapped.message).toContain(message);
				});

				test("should handle APIError with special characters in message", () => {
					const message = "Error: <script>alert('xss')</script>";
					const error = new APIError(StatusCodes.BAD_REQUEST, { message }, message, {});

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.code).toBe(ErrorCode.LLMApiError);
					expect(mapped.message).toContain("<script>");
				});

				test("should handle empty operation", () => {
					const error = new Error("Test error");

					const mapped = mapError(error, "");

					expect(mapped.operation).toBe("");
					expect(mapped.code).toBe(ErrorCode.UnknownError);
				});

				test("should handle very long error messages", () => {
					const longMessage = "Error: " + "x".repeat(10000);
					const error = new Error(longMessage);

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.code).toBe(ErrorCode.UnknownError);
					expect(mapped.message).toBe(longMessage);
				});

				test("should handle uncast APIError objects", () => {
					const error = {
						name: "APIError",
						message: "Uncast API error",
						status: StatusCodes.BAD_REQUEST,
						type: "UncastAPIError",
						code: null,
						param: null,
						error: { message: "Uncast API error" },
						headers: { "x-request-id": "UncastAPIError" },
						request_id: "UncastAPIError",
					};

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.code).toBe(ErrorCode.LLMApiError);
					expect(mapped.message).toContain("Uncast API error");
					expect(mapped.operation).toBe("TranslatorService.callLanguageModel");
					expect(mapped.metadata?.type).toBe("UncastAPIError");
					expect(mapped.metadata?.statusCode).toBe(StatusCodes.BAD_REQUEST);
					expect(mapped.metadata?.originalMessage).toBe("Uncast API error");
				});
			});
		});
	});
});
