import fs from "node:fs/promises";
import path from "node:path";

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { TranslationFile } from "@/services/";
import { ChunksManager } from "@/services/translator/managers";
import {
	CHUNKS,
	SYSTEM_PROMPT_TOKEN_RESERVE,
} from "@/services/translator/managers/managers.constants";

const FIXTURE_PATH = path.resolve(
	import.meta.dir,
	"../fixtures/react-labs-view-transitions-activity-and-more.md",
);

const TEST_MODEL = "gpt-4o";

describe("ChunksManager", () => {
	let chunksManager: ChunksManager;

	beforeEach(() => {
		chunksManager = new ChunksManager(TEST_MODEL);
	});

	describe("getTiktokenModel", () => {
		test("should return a supported model when the input matches by substring", () => {
			const result = chunksManager.getTiktokenModel("gpt-4o");

			expect(result).toBe("gpt-4");
		});

		test("should match the first supported model found via substring inclusion", () => {
			const result = chunksManager.getTiktokenModel("gpt-4o-2024-08-06");

			expect(result).toBe("gpt-4");
		});

		test("should fall back to the default model for unsupported identifiers", () => {
			const result = chunksManager.getTiktokenModel("gemini-2.0-flash");

			expect(result).toBe("gpt-5");
		});
	});

	describe("estimateTokenCount", () => {
		test("should return a positive token count for non-empty content", () => {
			const count = chunksManager.estimateTokenCount("Hello, world!");

			expect(count).toBeGreaterThan(0);
		});

		test("should return 0 for empty content", () => {
			const count = chunksManager.estimateTokenCount("");

			expect(count).toBe(0);
		});

		test("should scale roughly with content length", () => {
			const short = chunksManager.estimateTokenCount("Hello");
			const long = chunksManager.estimateTokenCount("Hello ".repeat(100));

			expect(long).toBeGreaterThan(short);
		});
	});

	describe("needsChunking", () => {
		const maxInputTokens = CHUNKS.maxTokens - SYSTEM_PROMPT_TOKEN_RESERVE;

		test("should return false for content well below the token limit", () => {
			const file = new TranslationFile("# Short\n\nA paragraph.", "short.md", "short.md", "sha1");

			expect(chunksManager.needsChunking(file)).toBe(false);
		});

		test("should return true for content that exceeds the token limit", () => {
			const longContent = "word ".repeat(maxInputTokens * 2);
			const file = new TranslationFile(longContent, "big.md", "big.md", "sha2");

			expect(chunksManager.needsChunking(file)).toBe(true);
		});

		test("should respect the configured threshold boundary", () => {
			const smallContent = "word ".repeat(200);
			const smallFile = new TranslationFile(smallContent, "small.md", "small.md", "sha3");
			const smallTokens = chunksManager.estimateTokenCount(smallContent);

			expect(smallTokens).toBeLessThan(maxInputTokens);
			expect(chunksManager.needsChunking(smallFile)).toBe(false);
		});

		test("should require chunking when input fits a huge context but exceeds completion-sized single shot", () => {
			const completionBounded = new ChunksManager(TEST_MODEL, 500_000, 8192);
			let content = "# Long document\n\n";
			while (completionBounded.estimateTokenCount(content) < 7200) {
				content += "Paragraph text for sizing. ".repeat(25) + "\n\n";
			}

			const file = new TranslationFile(content, "long.md", "long.md", "sha-completion");

			expect(completionBounded.needsChunking(file)).toBe(true);
		});

		test("should split long bodies into chunks bounded by the completion cap", async () => {
			const completionBounded = new ChunksManager(TEST_MODEL, 500_000, 8192);
			const budget = completionBounded.getMarkdownChunkSplitterTokenBudget();
			let content = "# Title\n\n";
			while (completionBounded.estimateTokenCount(content) < budget * 4) {
				content += `## Section\n\n${"Line content. ".repeat(120)}\n\n`;
			}

			const result = await completionBounded.chunkContent(content);

			expect(result.chunks.length).toBeGreaterThan(1);
			for (const chunk of result.chunks) {
				expect(completionBounded.estimateTokenCount(chunk)).toBeLessThanOrEqual(
					budget + CHUNKS.overlap,
				);
			}
		});
	});

	describe("chunkContent", () => {
		test("should return a single chunk for short content", async () => {
			const content = "# Title\n\nA short paragraph.";

			const result = await chunksManager.chunkContent(content);

			expect(result.chunks).toHaveLength(1);
			expect(result.separators).toHaveLength(0);
		});

		test("should split long content into multiple chunks", async () => {
			const content = Array.from(
				{ length: 50 },
				(_, i) => `## Section ${i + 1}\n\n${"Content paragraph. ".repeat(80)}`,
			).join("\n\n");

			const result = await chunksManager.chunkContent(content);

			expect(result.chunks.length).toBeGreaterThan(1);
			expect(result.separators).toHaveLength(result.chunks.length - 1);
		});

		test("should preserve separators that exist in the original content", async () => {
			const sections = Array.from(
				{ length: 30 },
				(_, i) => `## Section ${i + 1}\n\n${"Paragraph content here. ".repeat(60)}`,
			);
			const content = sections.join("\n\n");

			const result = await chunksManager.chunkContent(content);

			for (const separator of result.separators) {
				expect(separator.length).toBeGreaterThan(0);
				expect(content).toContain(separator);
			}
		});

		test("should produce chunks whose tokens each stay within the configured limit", async () => {
			const content = Array.from(
				{ length: 40 },
				(_, i) => `## Section ${i + 1}\n\n${"Some documentation text. ".repeat(80)}`,
			).join("\n\n");

			const maxTokensPerChunk = chunksManager.getMarkdownChunkSplitterTokenBudget();
			const result = await chunksManager.chunkContent(content);

			for (const chunk of result.chunks) {
				const tokens = chunksManager.estimateTokenCount(chunk);
				expect(tokens).toBeLessThanOrEqual(maxTokensPerChunk + CHUNKS.overlap);
			}
		});

		test("should not produce empty chunks", async () => {
			const content = Array.from(
				{ length: 30 },
				(_, i) => `## Section ${i + 1}\n\n${"Text. ".repeat(100)}`,
			).join("\n\n\n\n");

			const result = await chunksManager.chunkContent(content);

			for (const chunk of result.chunks) {
				expect(chunk.trim().length).toBeGreaterThan(0);
			}
		});
	});

	describe("chunkContent with real fixture", () => {
		let fixtureContent: string;

		beforeAll(async () => {
			fixtureContent = await fs.readFile(FIXTURE_PATH, "utf-8");
		});

		test("fixture should be large enough to require chunking", () => {
			const file = new TranslationFile(fixtureContent, "fixture.md", "fixture.md", "sha-fixture");

			expect(chunksManager.needsChunking(file)).toBe(true);
		});

		test("should split the fixture into multiple chunks with separators", async () => {
			const result = await chunksManager.chunkContent(fixtureContent);

			expect(result.chunks.length).toBeGreaterThan(1);
			expect(result.separators).toHaveLength(result.chunks.length - 1);
		});

		test("reassembled chunks should cover key structural elements of the original", async () => {
			const result = await chunksManager.chunkContent(fixtureContent);

			const reassembled = result.chunks.reduce((acc, chunk, index) => {
				return acc + chunk + (result.separators[index] ?? "");
			}, "");

			const originalHeadingMatches = fixtureContent.match(/^#{1,6}\s.+/gm) ?? [];
			const reassembledHeadingMatches = reassembled.match(/^#{1,6}\s.+/gm) ?? [];

			expect(reassembledHeadingMatches.length).toBeGreaterThanOrEqual(
				originalHeadingMatches.length * 0.9,
			);

			expect(reassembled.length).toBeGreaterThan(fixtureContent.length * 0.8);
		});

		test("each chunk should stay within token limits", async () => {
			const maxTokensPerChunk = chunksManager.getMarkdownChunkSplitterTokenBudget();
			const result = await chunksManager.chunkContent(fixtureContent);

			for (const chunk of result.chunks) {
				const tokens = chunksManager.estimateTokenCount(chunk);
				expect(tokens).toBeLessThanOrEqual(maxTokensPerChunk + CHUNKS.overlap);
			}
		});

		test("chunk count should be proportional to content size", async () => {
			const totalTokens = chunksManager.estimateTokenCount(fixtureContent);
			const maxTokensPerChunk = chunksManager.getMarkdownChunkSplitterTokenBudget();
			const expectedMinChunks = Math.floor(totalTokens / maxTokensPerChunk);

			const result = await chunksManager.chunkContent(fixtureContent);

			expect(result.chunks.length).toBeGreaterThanOrEqual(expectedMinChunks);
		});
	});
});
