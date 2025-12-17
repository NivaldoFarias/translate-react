import { describe, expect, test } from "bun:test";
import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";

import { ErrorCode, ErrorSeverity } from "@/errors/base-error";
import { LLMErrorHelper } from "@/errors/helpers/llm-error.helper";

describe("LLMErrorHelper", () => {
	const helper = new LLMErrorHelper();

	describe("APIError mapping", () => {
		test("should map APIError to LLMApiError", () => {
			const message = "Invalid request";
			const error = new APIError(StatusCodes.BAD_REQUEST, { message }, message, {});

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.message).toContain("Invalid request");
		});

		test("should preserve error metadata", () => {
			const message = "Bad request";
			const error = new APIError(StatusCodes.BAD_REQUEST, { message }, message, {});

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
				metadata: { model: "gpt-4", contentLength: 1500 },
			});

			expect(mapped.context.operation).toBe("TranslatorService.callLanguageModel");
			expect(mapped.context.metadata?.model).toBe("gpt-4");
			expect(mapped.context.metadata?.contentLength).toBe(1500);
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

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(errorCode);
			expect(mapped.message).toContain(message);
		});

		describe("Non-Error object handling", () => {
			test("should handle string errors", () => {
				const error = "String error message";

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.callLanguageModel",
				});

				expect(mapped.message).toContain("String error message");
			});

			test("should handle null errors", () => {
				const error = null;

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.callLanguageModel",
				});

				expect(mapped.message).toBe("null");
			});

			test("should handle undefined errors", () => {
				const error = undefined;

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.callLanguageModel",
				});

				expect(mapped.message).toBe("undefined");
			});

			test("should handle object errors", () => {
				const error = { message: "Object error", code: 500 };

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.callLanguageModel",
				});

				expect(mapped.code).toBe(ErrorCode.UnknownError);
				expect(mapped.message).toContain("[object Object]");
			});
		});

		describe("Context preservation", () => {
			test("should preserve metadata context", () => {
				const error = new Error("Test error");

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.translateText",
					metadata: {
						model: "gpt-4",
						temperature: 0.7,
						maxTokens: 2000,
					},
				});

				expect(mapped.context.metadata?.model).toBe("gpt-4");
				expect(mapped.context.metadata?.temperature).toBe(0.7);
				expect(mapped.context.metadata?.maxTokens).toBe(2000);
			});

			test("should handle missing metadata gracefully", () => {
				const error = new Error("Test error");

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.translateText",
				});

				expect(mapped.context.operation).toBe("TranslatorService.translateText");
				expect(mapped.context.metadata).toBeDefined();
			});
		});

		describe("getSeverityFromCode", () => {
			test("should return Error severity for RateLimitExceeded", () => {
				const severity = helper.getSeverityFromCode(ErrorCode.RateLimitExceeded);

				expect(severity).toBe(ErrorSeverity.Error);
			});

			test("should return Error severity for LLMApiError", () => {
				const severity = helper.getSeverityFromCode(ErrorCode.LLMApiError);

				expect(severity).toBe(ErrorSeverity.Error);
			});

			test("should return Warn severity for UnknownError", () => {
				const severity = helper.getSeverityFromCode(ErrorCode.UnknownError);

				expect(severity).toBe(ErrorSeverity.Warn);
			});

			test("should return Info severity for other error codes", () => {
				const severity = helper.getSeverityFromCode(ErrorCode.GithubNotFound);

				expect(severity).toBe(ErrorSeverity.Info);
			});
		});

		describe("Edge Cases", () => {
			test("should handle APIError with empty message", () => {
				const message = "";
				const error = new APIError(StatusCodes.BAD_REQUEST, { message }, message, {});

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.callLanguageModel",
				});

				expect(mapped.code).toBe(ErrorCode.LLMApiError);
				expect(mapped.message).toContain(message);
			});

			test("should handle APIError with special characters in message", () => {
				const message = "Error: <script>alert('xss')</script>";
				const error = new APIError(StatusCodes.BAD_REQUEST, { message }, message, {});

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.callLanguageModel",
				});

				expect(mapped.code).toBe(ErrorCode.LLMApiError);
				expect(mapped.message).toContain("<script>");
			});

			test("should handle empty operation context", () => {
				const error = new Error("Test error");

				const mapped = helper.mapError(error, { operation: "" });

				expect(mapped.context.operation).toBe("");
				expect(mapped.code).toBe(ErrorCode.UnknownError);
			});

			test("should handle very long error messages", () => {
				const longMessage = "Error: " + "x".repeat(10000);
				const error = new Error(longMessage);

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.callLanguageModel",
				});

				expect(mapped.code).toBe(ErrorCode.UnknownError);
				expect(mapped.message).toBe(longMessage);
			});
		});
	});
});
