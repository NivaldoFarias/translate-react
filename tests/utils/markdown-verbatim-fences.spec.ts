import fs from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, test } from "bun:test";

import { ChunksManager } from "@/app/services/translator/chunking";
import {
	maskLargeVerbatimFencedCodeBlocks,
	restoreMaskedVerbatimFences,
} from "@/app/utils/markdown-verbatim-fences.util";

const FIXTURE_PATH = path.resolve(
	import.meta.dir,
	"../fixtures/md/react-labs-view-transitions-activity-and-more.md",
);

const TEST_MODEL = "gpt-4o";

describe("markdown verbatim fenced code blocks", () => {
	const chunksManager = new ChunksManager(TEST_MODEL);
	const estimateTokens = (content: string) => chunksManager.estimateTokenCount(content);

	describe("maskLargeVerbatimFencedCodeBlocks + restoreMaskedVerbatimFences", () => {
		test("round-trips when placeholders are preserved (identity translation)", () => {
			const markdown = "# Demo\n\nSmall fence stays.\n\n```js\nconst x = 1;\n```\n\nDone.\n";

			const { maskedMarkdown, replacements } = maskLargeVerbatimFencedCodeBlocks(markdown, {
				estimateTokens,
				minTokens: 500,
			});

			expect(replacements).toHaveLength(0);
			expect(maskedMarkdown).toBe(markdown);

			const restored = restoreMaskedVerbatimFences(maskedMarkdown, replacements);
			expect(restored).toBe(markdown);
		});

		test("masks only fences at or above the token threshold and restores them", () => {
			const body = "const n = 1;\n".repeat(400);
			const markdown = "# Title\n\n```ts\n" + body + "```\n\nAfter.\n";

			const { maskedMarkdown, replacements } = maskLargeVerbatimFencedCodeBlocks(markdown, {
				estimateTokens,
				minTokens: 80,
			});

			expect(replacements.length).toBeGreaterThanOrEqual(1);
			expect(estimateTokens(maskedMarkdown)).toBeLessThan(estimateTokens(markdown));

			const restored = restoreMaskedVerbatimFences(maskedMarkdown, replacements);
			expect(restored).toBe(markdown);
		});

		test("allows translated prose around placeholders while fences round-trip", () => {
			const body = "// line\n".repeat(200);
			const markdown = "Intro\n\n```js\n" + body + "```\n\nOutro\n";

			const { maskedMarkdown, replacements } = maskLargeVerbatimFencedCodeBlocks(markdown, {
				estimateTokens,
				minTokens: 40,
			});

			expect(replacements).toHaveLength(1);

			const translatedMasked = maskedMarkdown
				.replace("Intro", "Introdução")
				.replace("Outro", "Conclusão");

			const restored = restoreMaskedVerbatimFences(translatedMasked, replacements);

			expect(restored).toContain("Introdução");
			expect(restored).toContain("Conclusão");
			expect(restored).toContain(replacements[0]?.originalFence ?? "");
			expect(restored).not.toContain("<!-- translate-react:");
		});
	});

	describe("react labs fixture (cost footprint)", () => {
		let fixtureContent: string;

		beforeAll(async () => {
			fixtureContent = await fs.readFile(FIXTURE_PATH, "utf-8");
		});

		test("fixture contains many large fenced blocks that qualify as verbatim candidates", () => {
			const minTokens = 120;
			const { replacements } = maskLargeVerbatimFencedCodeBlocks(fixtureContent, {
				estimateTokens,
				minTokens,
			});

			expect(replacements.length).toBeGreaterThanOrEqual(8);
		});

		test("masking materially reduces estimated input tokens versus full document", () => {
			const minTokens = 120;
			const fullTokens = estimateTokens(fixtureContent);
			const { maskedMarkdown, replacements } = maskLargeVerbatimFencedCodeBlocks(fixtureContent, {
				estimateTokens,
				minTokens,
			});

			expect(replacements.length).toBeGreaterThan(0);

			const maskedTokens = estimateTokens(maskedMarkdown);
			expect(maskedTokens).toBeLessThan(fullTokens * 0.85);

			const restored = restoreMaskedVerbatimFences(maskedMarkdown, replacements);
			expect(restored).toBe(fixtureContent);
		});

		test("masked fixture lowers chunk count versus unmasked (same chunker settings)", async () => {
			const minTokens = 120;
			const { maskedMarkdown, replacements } = maskLargeVerbatimFencedCodeBlocks(fixtureContent, {
				estimateTokens,
				minTokens,
			});

			const unchunked = await chunksManager.chunkContent(fixtureContent);
			const maskedChunks = await chunksManager.chunkContent(maskedMarkdown);

			expect(maskedChunks.chunks.length).toBeLessThanOrEqual(unchunked.chunks.length);
			expect(restoreMaskedVerbatimFences(maskedMarkdown, replacements)).toBe(fixtureContent);
		});
	});
});
