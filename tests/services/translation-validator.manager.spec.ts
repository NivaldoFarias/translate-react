import { beforeEach, describe, expect, test } from "bun:test";

import type { ChunksToReassemble } from "@/services/translator/managers/chunks.manager";

import { ApplicationError } from "@/errors";
import { TranslationFile } from "@/services/";
import { TranslationValidatorManager } from "@/services/translator/managers";

import { createMockLanguageDetectorService } from "@tests/mocks";

describe("TranslationValidatorManager", () => {
	let validator: TranslationValidatorManager;

	beforeEach(() => {
		validator = new TranslationValidatorManager(createMockLanguageDetectorService() as never);
	});

	describe("validateAndReassembleChunks", () => {
		function makeFile(content: string) {
			return new TranslationFile(content, "test.md", "path/test.md", "sha123");
		}

		test("should reassemble translated chunks using the original separators", () => {
			const file = makeFile("chunk-a\n\nchunk-b\n\n\nchunk-c");

			const chunks: ChunksToReassemble = {
				original: ["chunk-a", "chunk-b", "chunk-c"],
				translated: ["parte-a", "parte-b", "parte-c"],
				separators: ["\n\n", "\n\n\n"],
			};

			const result = validator.validateAndReassembleChunks(file, chunks);

			expect(result).toBe("parte-a\n\nparte-b\n\n\nparte-c");
		});

		test("should throw when translated chunk count does not match original", () => {
			const file = makeFile("chunk-a\n\nchunk-b");

			const chunks: ChunksToReassemble = {
				original: ["chunk-a", "chunk-b"],
				translated: ["parte-a"],
				separators: ["\n\n"],
			};

			expect(() => validator.validateAndReassembleChunks(file, chunks)).toThrow(ApplicationError);
		});

		test("should throw with ChunkProcessingFailed metadata on count mismatch", () => {
			const file = makeFile("a\n\nb\n\nc");

			const chunks: ChunksToReassemble = {
				original: ["a", "b", "c"],
				translated: ["x"],
				separators: ["\n\n", "\n\n"],
			};

			try {
				validator.validateAndReassembleChunks(file, chunks);
				expect.unreachable("should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(ApplicationError);
				expect((error as ApplicationError).message).toContain("Chunk count mismatch");
			}
		});

		test("should restore trailing newlines from the original content", () => {
			const file = makeFile("chunk-a\n\nchunk-b\n\n");

			const chunks: ChunksToReassemble = {
				original: ["chunk-a", "chunk-b"],
				translated: ["parte-a", "parte-b"],
				separators: ["\n\n"],
			};

			const result = validator.validateAndReassembleChunks(file, chunks);

			expect(result.endsWith("\n")).toBe(true);
		});

		test("should not add trailing newlines when original has none", () => {
			const file = makeFile("chunk-a\n\nchunk-b");

			const chunks: ChunksToReassemble = {
				original: ["chunk-a", "chunk-b"],
				translated: ["parte-a", "parte-b"],
				separators: ["\n\n"],
			};

			const result = validator.validateAndReassembleChunks(file, chunks);

			expect(result).toBe("parte-a\n\nparte-b");
		});

		test("should handle a single chunk with no separators", () => {
			const file = makeFile("only chunk");

			const chunks: ChunksToReassemble = {
				original: ["only chunk"],
				translated: ["único fragmento"],
				separators: [],
			};

			const result = validator.validateAndReassembleChunks(file, chunks);

			expect(result).toBe("único fragmento");
		});

		test("should preserve complex separators like triple newlines", () => {
			const file = makeFile("a\n\n\n\nb");

			const chunks: ChunksToReassemble = {
				original: ["a", "b"],
				translated: ["x", "y"],
				separators: ["\n\n\n\n"],
			};

			const result = validator.validateAndReassembleChunks(file, chunks);

			expect(result).toBe("x\n\n\n\ny");
		});
	});

	describe("validateTranslation", () => {
		function makeFile(content: string) {
			return new TranslationFile(content, "test.md", "path/test.md", "sha123");
		}

		test("should throw when translated content is empty", () => {
			const file = makeFile("# Title\n\nSome content");

			expect(() => {
				validator.validateTranslation(file, "");
			}).toThrow("Translation produced empty content");
		});

		test("should throw when translated content is whitespace-only", () => {
			const file = makeFile("# Title\n\nSome content");

			expect(() => {
				validator.validateTranslation(file, "   \n  \t  ");
			}).toThrow("Translation produced empty content");
		});

		test("should throw when all headings are lost", () => {
			const file = makeFile("# Title\n\n## Section\n\nContent");

			expect(() => {
				validator.validateTranslation(file, "Just plain text");
			}).toThrow("All markdown headings lost during translation");
		});

		test("should pass when heading counts match", () => {
			const file = makeFile("# Title\n\n## Section\n\nContent");
			const translated = "# Título\n\n## Seção\n\nConteúdo";

			expect(() => {
				validator.validateTranslation(file, translated);
			}).not.toThrow();
		});

		test("should pass when original has no headings", () => {
			const file = makeFile("Just a paragraph with no headings.");

			expect(() => {
				validator.validateTranslation(file, "Apenas um parágrafo sem cabeçalhos.");
			}).not.toThrow();
		});
	});
});
