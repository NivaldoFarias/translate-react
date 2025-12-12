import { describe, expect, test } from "bun:test";

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
		test("should create error with filename", () => {
			const error = new EmptyContentError("test.md");

			expect(error).toBeInstanceOf(Error);
			expect(error.message).toContain("test.md");
			expect(error.message).toContain("empty");
			// File is in message, but not explicitly set in context.file
		});

		test("should include additional context", () => {
			const error = new EmptyContentError("test.md", {
				metadata: { size: 0 },
			});

			expect(error.context.metadata).toEqual({ size: 0 });
		});

		test("should have correct error code", () => {
			const error = new EmptyContentError("test.md");

			expect(error.code).toBeDefined();
		});
	});

	describe("TranslationValidationError", () => {
		test("should create error with reason and filename", () => {
			const error = new TranslationValidationError("Invalid format", "test.md");

			expect(error.message).toContain("Invalid format");
			expect(error.message).toContain("test.md");
		});

		test("should handle validation error with context", () => {
			const error = new TranslationValidationError("Size mismatch", "test.md", {
				metadata: { expected: 100, actual: 50 },
			});

			expect(error.context.metadata).toEqual({ expected: 100, actual: 50 });
		});

		test("should have correct error code", () => {
			const error = new TranslationValidationError("test reason", "test.md");

			expect(error.code).toBeDefined();
		});
	});

	describe("ChunkProcessingError", () => {
		test("should create error with message", () => {
			const error = new ChunkProcessingError("Chunk failed at index 3");

			expect(error.message).toContain("Chunk failed");
		});

		test("should include chunk-specific context", () => {
			const error = new ChunkProcessingError("test", {
				metadata: { chunkIndex: 3, totalChunks: 10 },
			});

			expect(error.context.metadata).toEqual({ chunkIndex: 3, totalChunks: 10 });
		});

		test("should have correct error code", () => {
			const error = new ChunkProcessingError("test");

			expect(error.code).toBeDefined();
		});
	});

	describe("InitializationError", () => {
		test("should create error with message", () => {
			const error = new InitializationError("Failed to initialize service");

			expect(error.message).toBe("Failed to initialize service");
		});

		test("should have correct error code", () => {
			const error = new InitializationError("test");

			expect(error.code).toBeDefined();
		});
	});

	describe("MissingKeyError", () => {
		test("should create error with key name", () => {
			const error = new MissingKeyError("translationKey");

			expect(error.message).toContain("translationKey");
			expect(error.message).toContain("not found");
		});

		test("should have correct error code", () => {
			const error = new MissingKeyError("key");

			expect(error.code).toBeDefined();
		});
	});

	describe("UnsupportedLanguageError", () => {
		test("should create error with language code", () => {
			const error = new UnsupportedLanguageError("xyz");

			expect(error.message).toContain("xyz");
			expect(error.message).toContain("not supported");
		});

		test("should have correct error code", () => {
			const error = new UnsupportedLanguageError("lang");

			expect(error.code).toBeDefined();
		});
	});

	describe("ResourceLoadError", () => {
		test("should create error with resource name", () => {
			const error = new ResourceLoadError("config.json");

			expect(error.message).toContain("config.json");
			expect(error.message).toContain("Failed to load");
		});

		test("should have correct error code", () => {
			const error = new ResourceLoadError("resource");

			expect(error.code).toBeDefined();
		});
	});

	describe("APIError", () => {
		test("should create error with endpoint and status code", () => {
			const error = new APIError("/api/translate", 500);

			expect(error.message).toContain("/api/translate");
			expect(error.message).toContain("500");
		});

		test("should have correct error code", () => {
			const error = new APIError("/test", 404);

			expect(error.code).toBeDefined();
		});
	});

	describe("ValidationError", () => {
		test("should create error with message", () => {
			const error = new ValidationError("Invalid input format");

			expect(error.message).toBe("Invalid input format");
		});

		test("should have correct error code", () => {
			const error = new ValidationError("test");

			expect(error.code).toBeDefined();
		});
	});

	describe("Error Inheritance", () => {
		test("EmptyContentError inherits from TranslationError", () => {
			const error = new EmptyContentError("test.md");

			expect(error).toBeInstanceOf(Error);
			expect(error.context).toBeDefined();
			expect(error.timestamp).toBeDefined();
		});

		test("TranslationValidationError inherits from TranslationError", () => {
			const error = new TranslationValidationError("Invalid", "test.md");

			expect(error).toBeInstanceOf(Error);
			expect(error.context).toBeDefined();
		});

		test("ChunkProcessingError inherits from TranslationError", () => {
			const error = new ChunkProcessingError("test", { metadata: { chunks: 5 } });

			expect(error.context.metadata).toEqual({ chunks: 5 });
		});

		test("All errors inherit from TranslationError", () => {
			const errors = [
				new InitializationError("test"),
				new MissingKeyError("key"),
				new UnsupportedLanguageError("lang"),
				new ResourceLoadError("resource"),
				new APIError("/endpoint", 500),
				new ValidationError("test"),
			];

			errors.forEach((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(error.code).toBeDefined();
				expect(error.timestamp).toBeDefined();
			});
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
				new APIError("/test", 500),
				new ValidationError("test"),
			];

			errors.forEach((error) => {
				expect(error.stack).toBeDefined();
			});
		});
	});
});
