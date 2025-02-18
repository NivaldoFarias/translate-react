import { describe, expect, test } from "bun:test";

import { ErrorCodes, TranslationError } from "@/utils/errors.util";

/**
 * Test suite for Translation Error Utilities
 * Tests error creation and error code handling
 */
describe("Translation Error Utilities", () => {
	test("should create error with message only", () => {
		const error = new TranslationError("Test error message");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(TranslationError);
		expect(error.message).toBe("Test error message");
		expect(error.name).toBe("TranslationError");
	});

	test("should create error with code", () => {
		const error = new TranslationError("GitHub API error occurred", ErrorCodes.GITHUB_API_ERROR);
		expect(error).toBeInstanceOf(TranslationError);
		expect(error.message).toBe("GitHub API error occurred");
		expect(error.code).toBe(ErrorCodes.GITHUB_API_ERROR);
	});

	test("should create error with context", () => {
		const context = { fileId: "123", operation: "translate" };
		const error = new TranslationError(
			"Translation failed",
			ErrorCodes.TRANSLATION_FAILED,
			context,
		);
		expect(error).toBeInstanceOf(TranslationError);
		expect(error.message).toBe("Translation failed");
		expect(error.code).toBe(ErrorCodes.TRANSLATION_FAILED);
		expect(error.context).toEqual(context);
	});

	test("should handle undefined code and context", () => {
		const error = new TranslationError("Simple error");
		expect(error).toBeInstanceOf(TranslationError);
		expect(error.message).toBe("Simple error");
		expect(error.code).toBeUndefined();
		expect(error.context).toBeUndefined();
	});

	test("should verify all error codes are strings", () => {
		Object.values(ErrorCodes).forEach((code) => {
			expect(typeof code).toBe("string");
		});
	});
});
