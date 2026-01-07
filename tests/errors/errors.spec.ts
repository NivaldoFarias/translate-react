import { describe, expect, test } from "bun:test";

import {
	ApplicationError,
	createChunkProcessingError,
	createEmptyContentError,
	createInitializationError,
	createResourceLoadError,
	createTranslationValidationError,
	ErrorCode,
} from "@/errors/";

describe("Error Factory Functions", () => {
	describe("createEmptyContentError", () => {
		test("should create error with filename in message", () => {
			const error = createEmptyContentError("test.md");

			expect(error).toBeInstanceOf(ApplicationError);
			expect(error.message).toContain("test.md");
			expect(error.message).toContain("empty");
		});

		test("should include operation and metadata when provided", () => {
			const error = createEmptyContentError("test.md", "FileLoader.loadFile", { size: 0 });

			expect(error.operation).toBe("FileLoader.loadFile");
			expect(error.metadata).toEqual({ size: 0 });
		});

		test("should have NO_CONTENT error code", () => {
			const error = createEmptyContentError("test.md");

			expect(error.code).toBe(ErrorCode.NoContent);
		});

		test("should handle empty filename", () => {
			const error = createEmptyContentError("");

			expect(error.message).toContain("empty");
			expect(error.code).toBe(ErrorCode.NoContent);
		});

		test("should handle special characters in filename", () => {
			const error = createEmptyContentError("test-file_name.with.dots.md");

			expect(error.message).toContain("test-file_name.with.dots.md");
		});
	});

	describe("createTranslationValidationError", () => {
		test("should create error with reason and filename in message", () => {
			const error = createTranslationValidationError("Invalid format", "test.md");

			expect(error.message).toContain("Invalid format");
			expect(error.message).toContain("test.md");
		});

		test("should include operation and metadata when provided", () => {
			const error = createTranslationValidationError(
				"Size mismatch",
				"test.md",
				"Translator.validateTranslation",
				{ expected: 100, actual: 50 },
			);

			expect(error.operation).toBe("Translator.validateTranslation");
			expect(error.metadata).toEqual({ expected: 100, actual: 50 });
		});

		test("should have FORMAT_VALIDATION_FAILED error code", () => {
			const error = createTranslationValidationError("test reason", "test.md");

			expect(error.code).toBe(ErrorCode.FormatValidationFailed);
		});

		test("should handle empty reason", () => {
			const error = createTranslationValidationError("", "test.md");

			expect(error.message).toContain("test.md");
		});
	});

	describe("createChunkProcessingError", () => {
		test("should create error with message", () => {
			const error = createChunkProcessingError("Chunk failed at index 3");

			expect(error.message).toContain("Chunk failed");
		});

		test("should include chunk-specific metadata when provided", () => {
			const error = createChunkProcessingError("test", "TranslatorService.processChunk", {
				chunkIndex: 3,
				totalChunks: 10,
			});

			expect(error.operation).toBe("TranslatorService.processChunk");
			expect(error.metadata).toEqual({ chunkIndex: 3, totalChunks: 10 });
		});

		test("should have CHUNK_PROCESSING_FAILED error code", () => {
			const error = createChunkProcessingError("test");

			expect(error.code).toBe(ErrorCode.ChunkProcessingFailed);
		});
	});

	describe("createInitializationError", () => {
		test("should create error with message", () => {
			const error = createInitializationError("Failed to initialize service");

			expect(error.message).toBe("Failed to initialize service");
		});

		test("should have INITIALIZATION_ERROR error code", () => {
			const error = createInitializationError("test");

			expect(error.code).toBe(ErrorCode.InitializationError);
		});

		test("should include operation and metadata when provided", () => {
			const error = createInitializationError("test", "Service.init", { service: "test" });

			expect(error.operation).toBe("Service.init");
			expect(error.metadata).toEqual({ service: "test" });
		});
	});

	describe("createResourceLoadError", () => {
		test("should create error with resource name in message", () => {
			const error = createResourceLoadError("config.json");

			expect(error.message).toContain("config.json");
			expect(error.message).toContain("Failed to load");
		});

		test("should have RESOURCE_LOAD_ERROR error code", () => {
			const error = createResourceLoadError("resource");

			expect(error.code).toBe(ErrorCode.ResourceLoadError);
		});

		test("should include operation and metadata when provided", () => {
			const error = createResourceLoadError("config.json", "Config.load", { path: "/etc" });

			expect(error.operation).toBe("Config.load");
			expect(error.metadata).toEqual({ path: "/etc" });
		});
	});

	describe("Common Factory Behavior", () => {
		test("all factories return ApplicationError instances", () => {
			const errors = [
				createEmptyContentError("test.md"),
				createTranslationValidationError("test", "file.md"),
				createChunkProcessingError("test"),
				createInitializationError("test"),
				createResourceLoadError("resource"),
			];

			for (const error of errors) {
				expect(error).toBeInstanceOf(ApplicationError);
				expect(error).toBeInstanceOf(Error);
				expect(error.code).toBeDefined();
			}
		});

		test("all errors preserve stack traces", () => {
			const errors = [
				createEmptyContentError("test.md"),
				createTranslationValidationError("test", "file.md"),
				createChunkProcessingError("test"),
				createInitializationError("test"),
				createResourceLoadError("resource"),
			];

			for (const error of errors) {
				expect(error.stack).toBeDefined();
				expect(error.stack).toContain("ApplicationError");
			}
		});

		test("all errors default to UnknownOperation when operation not provided", () => {
			const errors = [
				createEmptyContentError("test.md"),
				createTranslationValidationError("test", "file.md"),
				createChunkProcessingError("test"),
				createInitializationError("test"),
				createResourceLoadError("resource"),
			];

			for (const error of errors) {
				expect(error.operation).toBe("UnknownOperation");
			}
		});
	});
});
