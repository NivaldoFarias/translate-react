import { describe, expect, test } from "bun:test";

import { ApplicationError, ErrorCode } from "@/errors/";

describe("Error Factory Functions", () => {
	describe("createEmptyContentError", () => {
		test("should create error with filename in message", () => {
			const filename = "test.md";
			const error = new ApplicationError(`File ${filename} is empty`, ErrorCode.NoContent);

			expect(error).toBeInstanceOf(ApplicationError);
			expect(error.message).toContain(filename);
			expect(error.message).toContain("empty");
		});

		test("should include operation and metadata when provided", () => {
			const error = new ApplicationError(
				"File test.md is empty",
				ErrorCode.NoContent,
				"FileLoader.loadFile",
				{ size: 0 },
			);

			expect(error.operation).toBe("FileLoader.loadFile");
			expect(error.metadata).toEqual({ size: 0 });
		});

		test("should have NO_CONTENT error code", () => {
			const error = new ApplicationError("File test.md is empty", ErrorCode.NoContent);

			expect(error.code).toBe(ErrorCode.NoContent);
		});

		test("should handle empty filename", () => {
			const error = new ApplicationError("File  is empty", ErrorCode.NoContent);

			expect(error.message).toContain("empty");
			expect(error.code).toBe(ErrorCode.NoContent);
		});

		test("should handle special characters in filename", () => {
			const name = "test-file_name.with.dots.md";
			const error = new ApplicationError(`File ${name} is empty`, ErrorCode.NoContent);

			expect(error.message).toContain(name);
		});
	});

	describe("createTranslationValidationError", () => {
		test("should create error with reason and filename in message", () => {
			const reason = "Invalid format";
			const filename = "test.md";
			const error = new ApplicationError(
				`${reason} - ${filename}`,
				ErrorCode.FormatValidationFailed,
			);

			expect(error.message).toContain(reason);
			expect(error.message).toContain(filename);
		});

		test("should include operation and metadata when provided", () => {
			const error = new ApplicationError(
				"Size mismatch - test.md",
				ErrorCode.FormatValidationFailed,
				"Translator.validateTranslation",
				{ expected: 100, actual: 50 },
			);

			expect(error.operation).toBe("Translator.validateTranslation");
			expect(error.metadata).toEqual({ expected: 100, actual: 50 });
		});

		test("should have FORMAT_VALIDATION_FAILED error code", () => {
			const error = new ApplicationError("test reason - test.md", ErrorCode.FormatValidationFailed);

			expect(error.code).toBe(ErrorCode.FormatValidationFailed);
		});

		test("should handle empty reason", () => {
			const error = new ApplicationError(" - test.md", ErrorCode.FormatValidationFailed);

			expect(error.message).toContain("test.md");
		});
	});

	describe("createChunkProcessingError", () => {
		test("should create error with message", () => {
			const error = new ApplicationError(
				"Chunk failed at index 3",
				ErrorCode.ChunkProcessingFailed,
			);

			expect(error.message).toContain("Chunk failed");
		});

		test("should include chunk-specific metadata when provided", () => {
			const error = new ApplicationError(
				"test",
				ErrorCode.ChunkProcessingFailed,
				"TranslatorService.processChunk",
				{ chunkIndex: 3, totalChunks: 10 },
			);

			expect(error.operation).toBe("TranslatorService.processChunk");
			expect(error.metadata).toEqual({ chunkIndex: 3, totalChunks: 10 });
		});

		test("should have CHUNK_PROCESSING_FAILED error code", () => {
			const error = new ApplicationError("test", ErrorCode.ChunkProcessingFailed);

			expect(error.code).toBe(ErrorCode.ChunkProcessingFailed);
		});
	});

	describe("createInitializationError", () => {
		test("should create error with message", () => {
			const error = new ApplicationError(
				"Failed to initialize service",
				ErrorCode.InitializationError,
			);

			expect(error.message).toBe("Failed to initialize service");
		});

		test("should have INITIALIZATION_ERROR error code", () => {
			const error = new ApplicationError("test", ErrorCode.InitializationError);

			expect(error.code).toBe(ErrorCode.InitializationError);
		});

		test("should include operation and metadata when provided", () => {
			const error = new ApplicationError("test", ErrorCode.InitializationError, "Service.init", {
				service: "test",
			});

			expect(error.operation).toBe("Service.init");
			expect(error.metadata).toEqual({ service: "test" });
		});
	});

	describe("createResourceLoadError", () => {
		test("should create error with resource name in message", () => {
			const error = new ApplicationError(
				"Failed to load config.json",
				ErrorCode.ResourceLoadError,
				"UnknownOperation",
			);

			expect(error.message).toContain("config.json");
			expect(error.message).toContain("Failed to load");
		});

		test("should have RESOURCE_LOAD_ERROR error code", () => {
			const error = new ApplicationError(
				"Failed to load resource",
				ErrorCode.ResourceLoadError,
				"UnknownOperation",
			);

			expect(error.code).toBe(ErrorCode.ResourceLoadError);
		});

		test("should include operation and metadata when provided", () => {
			const error = new ApplicationError(
				"Failed to load config.json",
				ErrorCode.ResourceLoadError,
				"Config.load",
				{ path: "/etc" },
			);

			expect(error.operation).toBe("Config.load");
			expect(error.metadata).toEqual({ path: "/etc" });
		});
	});

	describe("Common Factory Behavior", () => {
		test("all factories return ApplicationError instances", () => {
			const errors = [
				new ApplicationError("File test.md is empty", ErrorCode.NoContent),
				new ApplicationError("test - file.md", ErrorCode.FormatValidationFailed),
				new ApplicationError("test", ErrorCode.ChunkProcessingFailed),
				new ApplicationError("test", ErrorCode.InitializationError),
				new ApplicationError(
					"Failed to load resource",
					ErrorCode.ResourceLoadError,
					"UnknownOperation",
				),
			];

			for (const error of errors) {
				expect(error).toBeInstanceOf(ApplicationError);
				expect(error).toBeInstanceOf(Error);
				expect(error.code).toBeDefined();
			}
		});

		test("all errors preserve stack traces", () => {
			const errors = [
				new ApplicationError("File test.md is empty", ErrorCode.NoContent),
				new ApplicationError("test - file.md", ErrorCode.FormatValidationFailed),
				new ApplicationError("test", ErrorCode.ChunkProcessingFailed),
				new ApplicationError("test", ErrorCode.InitializationError),
				new ApplicationError(
					"Failed to load resource",
					ErrorCode.ResourceLoadError,
					"UnknownOperation",
				),
			];

			for (const error of errors) {
				expect(error.stack).toBeDefined();
				expect(error.stack).toContain("ApplicationError");
			}
		});

		test("all errors default to UnknownOperation when operation not provided", () => {
			const errors = [
				new ApplicationError("File test.md is empty", ErrorCode.NoContent),
				new ApplicationError("test - file.md", ErrorCode.FormatValidationFailed),
				new ApplicationError("test", ErrorCode.ChunkProcessingFailed),
				new ApplicationError("test", ErrorCode.InitializationError),
				new ApplicationError(
					"Failed to load resource",
					ErrorCode.ResourceLoadError,
					"UnknownOperation",
				),
			];

			for (const error of errors) {
				expect(error.operation).toBe("UnknownOperation");
			}
		});
	});
});
