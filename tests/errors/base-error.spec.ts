import { describe, expect, test } from "bun:test";

import { ErrorCode, TranslationError } from "@/errors/base-error";

describe("TranslationError", () => {
	describe("Constructor", () => {
		test("should create error with all basic properties when instantiated with valid parameters", () => {
			const error = new TranslationError("Test error", ErrorCode.GithubApiError, {
				operation: "test.operation",
			});

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(TranslationError);
			expect(error.message).toBe("Test error");
			expect(error.code).toBe(ErrorCode.GithubApiError);
			expect(error.name).toBe("TranslationError");
		});

		test("should preserve operation and metadata when context object is provided", () => {
			const context = {
				operation: "test.operation",
				metadata: { key: "value" },
			};

			const error = new TranslationError("Test error", ErrorCode.NotFound, context);

			expect(error.operation).toBe("test.operation");
			expect(error.metadata).toEqual({ key: "value" });
		});

		test("should automatically include timestamp when error is created", () => {
			const error = new TranslationError("Test error", ErrorCode.UnknownError, {
				operation: "test",
			});

			expect(error.timestamp).toBeDefined();
			expect(error.timestamp).toBeInstanceOf(Date);
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
		])("should correctly assign error code %s when provided", (code) => {
			const error = new TranslationError("Test", code, { operation: "test" });

			expect(error.code).toBe(code);
		});
	});

	describe("toJSON", () => {
		test("should have all error properties accessible for serialization when properties are accessed", () => {
			const error = new TranslationError("Test error", ErrorCode.GithubApiError, {
				operation: "test.operation",
				metadata: { file: "test.ts" },
			});

			expect(error.name).toBe("TranslationError");
			expect(error.message).toBe("Test error");
			expect(error.code).toBe(ErrorCode.GithubApiError);
			expect(error.operation).toBe("test.operation");
			expect(error.metadata).toEqual({ file: "test.ts" });
			expect(error.timestamp).toBeDefined();
		});

		test("should include nested metadata for serialization when metadata is present", () => {
			const error = new TranslationError("Test", ErrorCode.UnknownError, {
				operation: "test",
				metadata: { nested: { value: 123 } },
			});

			expect(error.metadata).toEqual({ nested: { value: 123 } });
		});
	});

	describe("Error Chaining", () => {
		test("should handle errors without cause when no cause is provided", () => {
			const error = new TranslationError("Wrapped error", ErrorCode.UnknownError, {
				operation: "test",
			});

			expect(error.cause).toBeUndefined();
		});
	});

	describe("Edge Cases", () => {
		test("should handle empty message when empty string is provided", () => {
			const error = new TranslationError("", ErrorCode.UnknownError, { operation: "test" });

			expect(error.message).toBe("");
		});

		test("should handle very long messages when message exceeds 1000 characters", () => {
			const longMessage = "A".repeat(5000);

			const error = new TranslationError(longMessage, ErrorCode.UnknownError, {
				operation: "test",
			});

			expect(error.message).toBe(longMessage);
			expect(error.message.length).toBe(5000);
		});

		test("should handle messages with special characters when special characters are present", () => {
			const specialMessage = "Error: <test> & 'quotes' \"double\" \n\t\r unicode: 🚀 émojis";

			const error = new TranslationError(specialMessage, ErrorCode.UnknownError, {
				operation: "test",
			});

			expect(error.message).toBe(specialMessage);
			expect(error.message).toContain("🚀");
		});

		test("should handle minimal context when only operation is provided", () => {
			const error = new TranslationError("Test", ErrorCode.UnknownError, {
				operation: "minimal",
			});

			expect(error.operation).toBe("minimal");
			expect(error.metadata).toBeUndefined();
		});

		test("should handle complex nested metadata when deeply nested objects are provided", () => {
			const metadata = {
				array: [1, 2, 3],
				object: { nested: true },
				string: "value",
				number: 42,
				deepNesting: {
					level1: {
						level2: {
							level3: "deep value",
						},
					},
				},
			};

			const error = new TranslationError("Test", ErrorCode.UnknownError, {
				operation: "test",
				metadata,
			});

			expect(error.metadata).toEqual(metadata);
		});

		test("should handle undefined metadata when metadata is not provided", () => {
			const error = new TranslationError("Test", ErrorCode.UnknownError, {
				operation: "test",
			});

			expect(error.metadata).toBeUndefined();
		});

		test("should handle null values in metadata when null is explicitly provided", () => {
			const error = new TranslationError("Test", ErrorCode.UnknownError, {
				operation: "test",
				metadata: { nullValue: null, undefinedValue: undefined },
			});

			expect(error.metadata?.nullValue).toBeNull();
			expect(error.metadata?.undefinedValue).toBeUndefined();
		});

		test("should handle operation names with special characters when special chars are present", () => {
			const error = new TranslationError("Test", ErrorCode.UnknownError, {
				operation: "test.operation:with-special_chars/path",
			});

			expect(error.operation).toBe("test.operation:with-special_chars/path");
		});
	});
});
