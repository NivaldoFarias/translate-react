import { describe, expect, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import { ErrorCode } from "@/errors/base-error";
import {
	APIError,
	ChunkProcessingError,
	EmptyContentError,
	InitializationError,
	MissingKeyError,
	ResourceLoadError,
	TranslationValidationError,
	UnsupportedLanguageError,
	ValidationError,
} from "@/errors/errors";

describe("Specialized Error Classes", () => {
	describe("EmptyContentError", () => {
		test("should create error with filename in message when instantiated", () => {
			const error = new EmptyContentError("test.md");

			expect(error).toBeInstanceOf(Error);
			expect(error.message).toContain("test.md");
			expect(error.message).toContain("empty");
		});

		test("should include additional context when context object is provided", () => {
			const error = new EmptyContentError("test.md", {
				metadata: { size: 0 },
			});

			expect(error.context.metadata).toEqual({ size: 0 });
		});

		test("should have NO_CONTENT error code when created", () => {
			const error = new EmptyContentError("test.md");

			expect(error.code).toBe(ErrorCode.NoContent);
		});

		test("should handle empty filename when empty string is provided", () => {
			const error = new EmptyContentError("");

			expect(error.message).toContain("empty");
			expect(error.code).toBe(ErrorCode.NoContent);
		});

		test("should handle special characters in filename when special chars are present", () => {
			const error = new EmptyContentError("test-file_name.with.dots.md");

			expect(error.message).toContain("test-file_name.with.dots.md");
		});
	});

	describe("TranslationValidationError", () => {
		test("should create error with reason and filename in message when instantiated", () => {
			const error = new TranslationValidationError("Invalid format", "test.md");

			expect(error.message).toContain("Invalid format");
			expect(error.message).toContain("test.md");
		});

		test("should include metadata in context when metadata is provided", () => {
			const error = new TranslationValidationError("Size mismatch", "test.md", {
				metadata: { expected: 100, actual: 50 },
			});

			expect(error.context.metadata).toEqual({ expected: 100, actual: 50 });
		});

		test("should have FORMAT_VALIDATION_FAILED error code when created", () => {
			const error = new TranslationValidationError("test reason", "test.md");

			expect(error.code).toBe(ErrorCode.FormatValidationFailed);
		});

		test("should handle empty reason when empty string is provided", () => {
			const error = new TranslationValidationError("", "test.md");

			expect(error.message).toContain("test.md");
		});
	});

	describe("ChunkProcessingError", () => {
		test("should create error with message when instantiated", () => {
			const error = new ChunkProcessingError("Chunk failed at index 3");

			expect(error.message).toContain("Chunk failed");
		});

		test("should include chunk-specific metadata when context is provided", () => {
			const error = new ChunkProcessingError("test", {
				metadata: { chunkIndex: 3, totalChunks: 10 },
			});

			expect(error.context.metadata).toEqual({ chunkIndex: 3, totalChunks: 10 });
		});

		test("should have CHUNK_PROCESSING_FAILED error code when created", () => {
			const error = new ChunkProcessingError("test");

			expect(error.code).toBe(ErrorCode.ChunkProcessingFailed);
		});
	});

	describe("InitializationError", () => {
		test("should create error with message when instantiated", () => {
			const error = new InitializationError("Failed to initialize service");

			expect(error.message).toBe("Failed to initialize service");
		});

		test("should have INITIALIZATION_ERROR error code when created", () => {
			const error = new InitializationError("test");

			expect(error.code).toBe(ErrorCode.InitializationError);
		});
	});

	describe("MissingKeyError", () => {
		test("should create error with key name in message when instantiated", () => {
			const error = new MissingKeyError("translationKey");

			expect(error.message).toContain("translationKey");
			expect(error.message).toContain("not found");
		});

		test("should have MISSING_KEY error code when created", () => {
			const error = new MissingKeyError("key");

			expect(error.code).toBe(ErrorCode.MissingKey);
		});
	});

	describe("UnsupportedLanguageError", () => {
		test("should create error with language code in message when instantiated", () => {
			const error = new UnsupportedLanguageError("xyz");

			expect(error.message).toContain("xyz");
			expect(error.message).toContain("not supported");
		});

		test("should have UNSUPPORTED_LANG error code when created", () => {
			const error = new UnsupportedLanguageError("lang");

			expect(error.code).toBe(ErrorCode.UnsupportedLang);
		});
	});

	describe("ResourceLoadError", () => {
		test("should create error with resource name in message when instantiated", () => {
			const error = new ResourceLoadError("config.json");

			expect(error.message).toContain("config.json");
			expect(error.message).toContain("Failed to load");
		});

		test("should have RESOURCE_LOAD_ERROR error code when created", () => {
			const error = new ResourceLoadError("resource");

			expect(error.code).toBe(ErrorCode.ResourceLoadError);
		});
	});

	describe("APIError", () => {
		test("should create error with endpoint and status code in message when instantiated", () => {
			const error = new APIError("/api/translate", StatusCodes.INTERNAL_SERVER_ERROR);

			expect(error.message).toContain("/api/translate");
			expect(error.message).toContain(String(StatusCodes.INTERNAL_SERVER_ERROR));
		});

		test("should have API_ERROR error code when created", () => {
			const error = new APIError("/test", StatusCodes.BAD_REQUEST);

			expect(error.code).toBe(ErrorCode.ApiError);
		});

		test("should handle status code 0 when zero is provided", () => {
			const error = new APIError("/api/test", 0);

			expect(error.message).toContain("0");
		});

		test("should handle negative status codes when negative value is provided", () => {
			const error = new APIError("/api/test", -1);

			expect(error.message).toContain("-1");
		});
	});

	describe("ValidationError", () => {
		test("should create error with message when instantiated", () => {
			const error = new ValidationError("Invalid input format");

			expect(error.message).toBe("Invalid input format");
		});

		test("should have VALIDATION_ERROR error code when created", () => {
			const error = new ValidationError("test");

			expect(error.code).toBe(ErrorCode.ValidationError);
		});
	});

	describe("Error Inheritance", () => {
		test("EmptyContentError inherits from TranslationError when instantiated", () => {
			const error = new EmptyContentError("test.md");

			expect(error).toBeInstanceOf(Error);
			expect(error.context).toBeDefined();
			expect(error.timestamp).toBeDefined();
		});

		test("TranslationValidationError inherits from TranslationError when instantiated", () => {
			const error = new TranslationValidationError("Invalid", "test.md");

			expect(error).toBeInstanceOf(Error);
			expect(error.context).toBeDefined();
		});

		test("ChunkProcessingError inherits from TranslationError when instantiated", () => {
			const error = new ChunkProcessingError("test", { metadata: { chunks: 5 } });

			expect(error.context.metadata).toEqual({ chunks: 5 });
		});

		test("All errors inherit from TranslationError when instantiated", () => {
			const errors = [
				new InitializationError("test"),
				new MissingKeyError("key"),
				new UnsupportedLanguageError("lang"),
				new ResourceLoadError("resource"),
				new APIError("/endpoint", StatusCodes.INTERNAL_SERVER_ERROR),
				new ValidationError("test"),
			];

			for (const error of errors) {
				expect(error).toBeInstanceOf(Error);
				expect(error.code).toBeDefined();
				expect(error.timestamp).toBeDefined();
			}
		});
	});

	describe("Error Stack Traces", () => {
		test("should preserve stack trace in EmptyContentError", () => {
			const error = new EmptyContentError("test.md");

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain("EmptyContentError");
		});

		test("should preserve stack trace in TranslationValidationError", () => {
			const error = new TranslationValidationError("test", "test.md");

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain("TranslationValidationError");
		});

		test("should preserve stack trace in ChunkProcessingError", () => {
			const error = new ChunkProcessingError("test");

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain("ChunkProcessingError");
		});

		test("should preserve stack trace in all error types", () => {
			const errors = [
				new InitializationError("test"),
				new MissingKeyError("key"),
				new UnsupportedLanguageError("lang"),
				new ResourceLoadError("resource"),
				new APIError("/test", StatusCodes.INTERNAL_SERVER_ERROR),
				new ValidationError("test"),
			];

			errors.forEach((error) => {
				expect(error.stack).toBeDefined();
			});
		});
	});
});
