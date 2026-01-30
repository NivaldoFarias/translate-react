import { RequestError } from "@octokit/request-error";
import { describe, expect, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import { ErrorCode, mapError } from "@/errors/";

import { createOctokitRequestErrorFixture, createOpenAIApiErrorFixture } from "@tests/fixtures";

describe("mapError", () => {
	describe("Github API errors", () => {
		describe("Octokit's RequestError mapping", () => {
			test.each([
				[StatusCodes.NOT_FOUND, "Not Found", ErrorCode.OctokitRequestError],
				[StatusCodes.UNAUTHORIZED, "Unauthorized", ErrorCode.OctokitRequestError],
				[StatusCodes.FORBIDDEN, "Forbidden", ErrorCode.OctokitRequestError],
			])(
				"should map %d status to %s error code when RequestError occurs",
				(status, message, expectedCode) => {
					const error = createOctokitRequestErrorFixture({ message, status });

					const mapped = mapError(error, "test");

					expect(mapped.code).toBe(expectedCode);
					expect(mapped.message).toContain(message);
				},
			);

			test("should map RequestError with response headers", () => {
				const error = createOctokitRequestErrorFixture({
					message: "Rate limited",
					status: StatusCodes.FORBIDDEN,
					options: { response: { headers: { "x-ratelimit-remaining": "0" } } },
				});

				const mapped = mapError(error, "test");

				expect(mapped.code).toBe(ErrorCode.OctokitRequestError);
				expect(mapped.metadata?.requestId).toBeUndefined();
			});

			test("should map 500+ RequestError to OctokitRequestError", () => {
				const error = createOctokitRequestErrorFixture();

				const mapped = mapError(error, "test");

				expect(mapped.code).toBe(ErrorCode.OctokitRequestError);
			});

			test("should handle generic GitHub API RequestError", () => {
				const error = createOctokitRequestErrorFixture({
					message: "Bad request",
					status: StatusCodes.BAD_REQUEST,
				});

				const mapped = mapError(error, "test");

				expect(mapped.code).toBe(ErrorCode.OctokitRequestError);
			});
		});

		describe("Error instance handling", () => {
			test("should preserve operation and metadata", () => {
				const error = createOctokitRequestErrorFixture({
					message: "Test error",
					status: StatusCodes.NOT_FOUND,
					options: { response: { status: StatusCodes.NOT_FOUND } },
				});

				const mapped = mapError(error, "GitHub.getFile", {
					path: "test.md",
					repo: "test/repo",
				});

				expect(mapped.operation).toBe("GitHub.getFile");
				expect(mapped.metadata?.path).toBe("test.md");
				expect(mapped.metadata?.repo).toBe("test/repo");
			});

			test("should map generic Error instances to UnknownError", () => {
				const error = new Error("Generic error message");
				const mapped = mapError(error, "test");

				expect(mapped.code).toBe(ErrorCode.UnknownError);
				expect(mapped.message).toBe("Generic error message");
			});

			test("should handle errors without status code", () => {
				const error = new Error("Network error");

				const mapped = mapError(error, "test");

				expect(mapped.code).toBe(ErrorCode.UnknownError);
			});

			test("should include original error message in mapped error", () => {
				const error = createOctokitRequestErrorFixture({
					message: "Specific error details",
					status: StatusCodes.BAD_REQUEST,
					options: { response: { status: StatusCodes.BAD_REQUEST } },
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
				const error = createOctokitRequestErrorFixture({
					message: "Error",
					status: StatusCodes.BAD_REQUEST,
					options: { response: { status: StatusCodes.BAD_REQUEST } },
				});

				const mapped = mapError(error, "test");

				expect(mapped.code).toBe(ErrorCode.OctokitRequestError);
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

				expect(mapped.code).toBe(ErrorCode.OctokitRequestError);
				expect(mapped.message).toContain("Uncast RequestError");
				expect(mapped.operation).toBe("test");
				expect(mapped.metadata?.statusCode).toBe(StatusCodes.NOT_FOUND);
				expect(mapped.metadata?.requestId).toBe("Uncast RequestError");
			});
		});
	});

	describe("Openai/LLM API errors", () => {
		describe("APIError mapping", () => {
			test("should map APIError to OpenAIApiError", () => {
				const message = "Invalid request";
				const error = createOpenAIApiErrorFixture({
					status: StatusCodes.BAD_REQUEST,
					error: { message },
					message,
				});

				const mapped = mapError(error, "TranslatorService.callLanguageModel");

				expect(mapped.code).toBe(ErrorCode.OpenAIApiError);
				expect(mapped.message).toContain("Invalid request");
			});

			test("should preserve error metadata", () => {
				const message = "Bad request";
				const error = createOpenAIApiErrorFixture({
					status: StatusCodes.BAD_REQUEST,
					error: { message },
					message,
				});

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
			test("should map generic Error to UnknownError", () => {
				const error = new Error("Generic error");

				const mapped = mapError(error, "TranslatorService.callLanguageModel");

				expect(mapped.code).toBe(ErrorCode.UnknownError);
				expect(mapped.message).toContain("Generic error");
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
					const error = createOpenAIApiErrorFixture({
						status: StatusCodes.BAD_REQUEST,
						error: { message },
						message,
					});

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.code).toBe(ErrorCode.OpenAIApiError);
					expect(mapped.message).toContain(message);
				});

				test("should handle APIError with special characters in message", () => {
					const message = "Error: <script>alert('xss')</script>";
					const error = createOpenAIApiErrorFixture({
						status: StatusCodes.BAD_REQUEST,
						error: { message },
						message,
					});

					const mapped = mapError(error, "TranslatorService.callLanguageModel");

					expect(mapped.code).toBe(ErrorCode.OpenAIApiError);
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

					expect(mapped.code).toBe(ErrorCode.OpenAIApiError);
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
