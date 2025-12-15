import { describe, expect, test } from "bun:test";
import { APIError } from "openai/error";

import { ErrorCode, ErrorSeverity } from "@/errors/base-error";
import { LLMErrorHelper } from "@/errors/helpers/llm-error.helper";

describe("LLMErrorHelper", () => {
	const helper = new LLMErrorHelper();

	describe("APIError mapping", () => {
		test("should map APIError to LLMApiError", () => {
			const error = new APIError(400, { message: "Invalid request" }, "Invalid request", {});

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.LLMApiError);
			expect(mapped.message).toContain("Invalid request");
		});

		test("should detect rate limit from APIError message", () => {
			const error = new APIError(
				429,
				{ message: "Rate limit exceeded" },
				"Rate limit exceeded",
				{},
			);

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
		});

		test("should detect rate limit from 429 status code", () => {
			const error = new APIError(429, { message: "Too many requests" }, "Too many requests", {});

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
		});

		test("should preserve error metadata", () => {
			const error = new APIError(400, { message: "Bad request" }, "Bad request", {});

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
		test("should detect RateLimitError by constructor name", () => {
			class RateLimitError extends Error {
				constructor(message: string) {
					super(message);
					this.name = "RateLimitError";
				}
			}

			const error = new RateLimitError("Rate limit exceeded");

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
		});

		test("should detect QuotaExceededError by constructor name", () => {
			class QuotaExceededError extends Error {
				constructor(message: string) {
					super(message);
					this.name = "QuotaExceededError";
				}
			}

			const error = new QuotaExceededError("Quota exceeded");

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
		});

		test("should detect TooManyRequestsError by constructor name", () => {
			class TooManyRequestsError extends Error {
				constructor(message: string) {
					super(message);
					this.name = "TooManyRequestsError";
				}
			}

			const error = new TooManyRequestsError("Too many requests");

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
		});

		test.each([["rate limit exceeded"], ["too many requests"], ["429 error"], ["quota exceeded"]])(
			"should detect rate limit when error message contains '%s'",
			(message) => {
				const error = new Error(message);

				const mapped = helper.mapError(error, {
					operation: "TranslatorService.callLanguageModel",
				});

				expect(mapped.code).toBe(ErrorCode.RateLimitExceeded);
			},
		);

		test("should handle generic Error instances", () => {
			const error = new Error("Unknown LLM error");

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.UnknownError);
			expect(mapped.message).toContain("Unknown LLM error");
		});
	});

	describe("Non-Error object handling", () => {
		test("should handle string errors", () => {
			const error = "String error message";

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.UnknownError);
			expect(mapped.message).toContain("String error message");
		});

		test("should handle null errors", () => {
			const error = null;

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.UnknownError);
			expect(mapped.message).toBe("null");
		});

		test("should handle undefined errors", () => {
			const error = undefined;

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
			});

			expect(mapped.code).toBe(ErrorCode.UnknownError);
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
		test("should preserve operation context", () => {
			const error = new Error("Test error");

			const mapped = helper.mapError(error, {
				operation: "TranslatorService.translateText",
			});

			expect(mapped.context.operation).toBe("TranslatorService.translateText");
		});

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
});
