import { describe, expect, test } from "bun:test";

import { ErrorCode, TranslationError } from "@/errors/base-error";

describe("TranslationError", () => {
	describe("Constructor", () => {
		test("should create error with basic properties when instantiated", () => {
			const error = new TranslationError("Test error", ErrorCode.GithubApiError, {
				operation: "test.operation",
			});

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(TranslationError);
			expect(error.message).toBe("Test error");
			expect(error.code).toBe(ErrorCode.GithubApiError);
			expect(error.name).toBe("TranslationError");
		});

		test("should preserve error context when context object is provided", () => {
			const context = {
				operation: "test.operation",
				file: "test.ts",
				metadata: { key: "value" },
			};

			const error = new TranslationError("Test error", ErrorCode.NotFound, context);

			expect(error.context.operation).toBe("test.operation");
			expect(error.context.file).toBe("test.ts");
			expect(error.context.metadata).toEqual({ key: "value" });
		});

		test("should include timestamp in context when error is created", () => {
			const error = new TranslationError("Test error", ErrorCode.UnknownError, {
				operation: "test",
			});

			expect(error.context.timestamp).toBeDefined();
			expect(error.context.timestamp).toBeInstanceOf(Date);
		});

		test("should preserve stack trace when error is created", () => {
			const error = new TranslationError("Test error", ErrorCode.UnknownError, {
				operation: "test",
			});

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain("TranslationError");
		});
	});

	describe("Error Codes", () => {
		test.each([
			[ErrorCode.GithubApiError],
			[ErrorCode.NotFound],
			[ErrorCode.UnknownError],
			[ErrorCode.RateLimitExceeded],
		])("should handle error code %s when provided", (code) => {
			const error = new TranslationError("Test", code, { operation: "test" });

			expect(error.code).toBe(code);
		});
	});

	describe("toJSON", () => {
		test("should serialize to JSON correctly", () => {
			const error = new TranslationError("Test error", ErrorCode.GithubApiError, {
				operation: "test.operation",
				file: "test.ts",
			});

			expect(error.name).toBe("TranslationError");
			expect(error.message).toBe("Test error");
			expect(error.code).toBe(ErrorCode.GithubApiError);
			expect(error.context.operation).toBe("test.operation");
			expect(error.context.file).toBe("test.ts");
			expect(error.timestamp).toBeDefined();
		});

		test("should include all context fields in JSON", () => {
			const error = new TranslationError("Test", ErrorCode.UnknownError, {
				operation: "test",
				metadata: { nested: { value: 123 } },
			});

			expect(error.context.metadata).toEqual({ nested: { value: 123 } });
		});
	});

	describe("Error Chaining", () => {
		test("should handle errors without cause", () => {
			const error = new TranslationError("Wrapped error", ErrorCode.UnknownError, {
				operation: "test",
			});

			expect(error.cause).toBeUndefined();
		});
	});

	describe("Edge Cases", () => {
		test("should handle empty message", () => {
			const error = new TranslationError("", ErrorCode.UnknownError, { operation: "test" });

			expect(error.message).toBe("");
		});

		test("should handle minimal context", () => {
			const error = new TranslationError("Test", ErrorCode.UnknownError, {
				operation: "minimal",
			});

			expect(error.context.operation).toBe("minimal");
			expect(error.context.file).toBeUndefined();
		});

		test("should handle complex metadata", () => {
			const metadata = {
				array: [1, 2, 3],
				object: { nested: true },
				string: "value",
				number: 42,
			};

			const error = new TranslationError("Test", ErrorCode.UnknownError, {
				operation: "test",
				metadata,
			});

			expect(error.context.metadata).toEqual(metadata);
		});
	});
});
