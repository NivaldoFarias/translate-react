import { describe, expect, test } from "bun:test";

import { ApplicationError, ErrorCode } from "@/errors/";

describe("ApplicationError", () => {
	describe("Constructor", () => {
		test("should create error with all basic properties when instantiated with valid parameters", () => {
			const error = new ApplicationError("Test error", ErrorCode.GithubApiError, "test.operation");

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(ApplicationError);
			expect(error.message).toBe("Test error");
			expect(error.code).toBe(ErrorCode.GithubApiError);
			expect(error.name).toBe("ApplicationError");
		});

		test("should preserve operation and metadata when both are provided", () => {
			const error = new ApplicationError("Test error", ErrorCode.NotFound, "test.operation", {
				key: "value",
			});

			expect(error.operation).toBe("test.operation");
			expect(error.metadata).toEqual({ key: "value" });
		});

		test("should preserve stack trace when error is created", () => {
			const error = new ApplicationError("Test error", ErrorCode.UnknownError, "test");

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain("ApplicationError");
		});
	});

	describe("Error Codes", () => {
		test.each([
			[ErrorCode.GithubApiError],
			[ErrorCode.NotFound],
			[ErrorCode.UnknownError],
			[ErrorCode.RateLimitExceeded],
		])("should correctly assign error code %s when provided", (code) => {
			const error = new ApplicationError("Test", code, "test");

			expect(error.code).toBe(code);
		});
	});

	describe("toJSON", () => {
		test("should have all error properties accessible for serialization when properties are accessed", () => {
			const error = new ApplicationError("Test error", ErrorCode.GithubApiError, "test.operation", {
				file: "test.ts",
			});

			expect(error.name).toBe("ApplicationError");
			expect(error.message).toBe("Test error");
			expect(error.code).toBe(ErrorCode.GithubApiError);
			expect(error.operation).toBe("test.operation");
			expect(error.metadata).toEqual({ file: "test.ts" });
		});

		test("should include nested metadata for serialization when metadata is present", () => {
			const error = new ApplicationError("Test", ErrorCode.UnknownError, "test", {
				nested: { value: 123 },
			});

			expect(error.metadata).toEqual({ nested: { value: 123 } });
		});
	});

	describe("Error Chaining", () => {
		test("should handle errors without cause when no cause is provided", () => {
			const error = new ApplicationError("Wrapped error", ErrorCode.UnknownError, "test");

			expect(error.cause).toBeUndefined();
		});
	});

	describe("Edge Cases", () => {
		test("should handle empty message when empty string is provided", () => {
			const error = new ApplicationError("", ErrorCode.UnknownError, "test");

			expect(error.message).toBe("");
		});

		test("should handle very long messages when message exceeds 1000 characters", () => {
			const longMessage = "A".repeat(5000);

			const error = new ApplicationError(longMessage, ErrorCode.UnknownError, "test");

			expect(error.message).toBe(longMessage);
			expect(error.message.length).toBe(5000);
		});

		test("should handle messages with special characters when special characters are present", () => {
			const specialMessage = "Error: <test> & 'quotes' \"double\" \n\t\r unicode: 🚀 émojis";

			const error = new ApplicationError(specialMessage, ErrorCode.UnknownError, "test");

			expect(error.message).toBe(specialMessage);
			expect(error.message).toContain("🚀");
		});

		test("should handle minimal parameters when only operation is provided", () => {
			const error = new ApplicationError("Test", ErrorCode.UnknownError, "minimal");

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

			const error = new ApplicationError("Test", ErrorCode.UnknownError, "test", metadata);

			expect(error.metadata).toEqual(metadata);
		});

		test("should handle undefined metadata when metadata is not provided", () => {
			const error = new ApplicationError("Test", ErrorCode.UnknownError, "test");

			expect(error.metadata).toBeUndefined();
		});

		test("should handle null values in metadata when null is explicitly provided", () => {
			const error = new ApplicationError("Test", ErrorCode.UnknownError, "test", {
				nullValue: null,
				undefinedValue: undefined,
			});

			expect(error.metadata?.nullValue).toBeNull();
			expect(error.metadata?.undefinedValue).toBeUndefined();
		});

		test("should handle operation names with special characters when special chars are present", () => {
			const error = new ApplicationError(
				"Test",
				ErrorCode.UnknownError,
				"test.operation:with-special_chars/path",
			);

			expect(error.operation).toBe("test.operation:with-special_chars/path");
		});

		test("should use default operation when operation is not provided", () => {
			const error = new ApplicationError("Test", ErrorCode.UnknownError);

			expect(error.operation).toBe("UnknownOperation");
		});
	});
});
