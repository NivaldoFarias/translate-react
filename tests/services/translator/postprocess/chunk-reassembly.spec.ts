import { describe, expect, test } from "bun:test";

import type { ChunksToReassemble } from "@/services/translator/chunking/chunks.manager";

import { ApplicationError } from "@/errors";
import { validateAndReassembleChunks } from "@/services/translator/postprocess/chunk-reassembly";
import { TranslationFile } from "@/services/translator/translation-file";

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

		const result = validateAndReassembleChunks(file, chunks);

		expect(result).toBe("parte-a\n\nparte-b\n\n\nparte-c");
	});

	test("should throw when translated chunk count does not match original", () => {
		const file = makeFile("chunk-a\n\nchunk-b");

		const chunks: ChunksToReassemble = {
			original: ["chunk-a", "chunk-b"],
			translated: ["parte-a"],
			separators: ["\n\n"],
		};

		expect(() => validateAndReassembleChunks(file, chunks)).toThrow(ApplicationError);
	});

	test("should throw with ChunkProcessingFailed metadata on count mismatch", () => {
		const file = makeFile("a\n\nb\n\nc");

		const chunks: ChunksToReassemble = {
			original: ["a", "b", "c"],
			translated: ["x"],
			separators: ["\n\n", "\n\n"],
		};

		try {
			validateAndReassembleChunks(file, chunks);
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

		const result = validateAndReassembleChunks(file, chunks);

		expect(result.endsWith("\n")).toBe(true);
	});

	test("should not add trailing newlines when original has none", () => {
		const file = makeFile("chunk-a\n\nchunk-b");

		const chunks: ChunksToReassemble = {
			original: ["chunk-a", "chunk-b"],
			translated: ["parte-a", "parte-b"],
			separators: ["\n\n"],
		};

		const result = validateAndReassembleChunks(file, chunks);

		expect(result).toBe("parte-a\n\nparte-b");
	});

	test("should handle a single chunk with no separators", () => {
		const file = makeFile("only chunk");

		const chunks: ChunksToReassemble = {
			original: ["only chunk"],
			translated: ["único fragmento"],
			separators: [],
		};

		const result = validateAndReassembleChunks(file, chunks);

		expect(result).toBe("único fragmento");
	});

	test("should preserve complex separators like triple newlines", () => {
		const file = makeFile("a\n\n\n\nb");

		const chunks: ChunksToReassemble = {
			original: ["a", "b"],
			translated: ["x", "y"],
			separators: ["\n\n\n\n"],
		};

		const result = validateAndReassembleChunks(file, chunks);

		expect(result).toBe("x\n\n\n\ny");
	});
});
