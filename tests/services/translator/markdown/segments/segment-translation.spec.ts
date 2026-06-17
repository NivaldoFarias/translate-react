import { describe, expect, test } from "bun:test";

import { ChunksManager } from "@/app/services/translator/chunking";
import { splitLeadingYamlFrontmatter } from "@/app/services/translator/markdown/frontmatter";
import {
	computeTranslatableCharRatio,
	extractTranslatableBodySegments,
	filterTranslatableSegments,
	isSegmentTranslationEligible,
	packSegmentsIntoBatches,
	reinsertSegments,
	splitSegmentBatchInHalf,
} from "@/app/services/translator/markdown/segments";
import { maskLargeVerbatimFencedCodeBlocks } from "@/app/utils/markdown-verbatim-fences.util";

import { hydrateRootMd } from "@tests/fixtures/react-docs-fixtures";
import { loadSegmentFixture } from "@tests/fixtures/segment-extraction/load-fixture.util";

describe("segment translation utilities", () => {
	test("isSegmentTranslationEligible returns false when parse failed", () => {
		expect(isSegmentTranslationEligible(["parse failed: unexpected token"])).toBe(false);
	});

	test("isSegmentTranslationEligible returns false when position warnings exist", () => {
		expect(isSegmentTranslationEligible(["missing position for root/paragraph#0"])).toBe(false);
	});

	test("isSegmentTranslationEligible returns true when warnings are empty", () => {
		expect(isSegmentTranslationEligible([])).toBe(true);
	});

	test("computeTranslatableCharRatio returns zero for empty body", () => {
		expect(computeTranslatableCharRatio(100, 0)).toBe(0);
	});

	test("packSegmentsIntoBatches splits when segment cap is exceeded", () => {
		const translatable = Array.from({ length: 25 }, (_, index) => ({
			id: `root/paragraph#${index}`,
			path: `root/paragraph#${index}`,
			kind: "translate" as const,
			sourceText: `Sentence ${index}.`,
			start: index,
			end: index + 1,
		}));

		const cappedBatches = packSegmentsIntoBatches(
			translatable,
			(text) => Math.ceil(text.length / 4),
			100_000,
			10,
		);

		expect(cappedBatches.length).toBeGreaterThan(1);
		expect(cappedBatches.every((batch) => batch.length <= 10)).toBe(true);
	});

	test("packSegmentsIntoBatches splits when token budget is exceeded", () => {
		const body = `# Heading\n\n${"Prose sentence one. ".repeat(80)}`;
		const { segments } = extractTranslatableBodySegments(body);
		const translatable = filterTranslatableSegments(segments);

		const tinyBudgetBatches = packSegmentsIntoBatches(
			translatable,
			(text) => Math.ceil(text.length / 4),
			50,
		);

		expect(tinyBudgetBatches.length).toBeGreaterThan(1);
	});

	test("packSegmentsIntoBatches splits when completion response budget is exceeded", () => {
		const translatable = Array.from({ length: 12 }, (_, index) => ({
			id: `root/paragraph#${index}`,
			path: `root/paragraph#${index}`,
			kind: "translate" as const,
			sourceText: `Sentence ${index} with enough words to consume completion budget.`,
			start: index,
			end: index + 1,
		}));

		const responseCappedBatches = packSegmentsIntoBatches(
			translatable,
			(text) => Math.ceil(text.length / 4),
			100_000,
			40,
			80,
		);

		expect(responseCappedBatches.length).toBeGreaterThan(1);
	});

	test("splitSegmentBatchInHalf returns two non-empty halves for multi-item batches", () => {
		const items = [
			{ segmentId: "a", source: "one" },
			{ segmentId: "b", source: "two" },
			{ segmentId: "c", source: "three" },
		];

		const [firstHalf, secondHalf] = splitSegmentBatchInHalf(items);

		expect(firstHalf.length).toBeGreaterThan(0);
		expect(secondHalf.length).toBeGreaterThan(0);
		expect(firstHalf.length + secondHalf.length).toBe(items.length);
	});

	test("extractTranslatableBodySegments returns no translate segments for code-only body", () => {
		const { segments } = extractTranslatableBodySegments("```js\nconst x = 1;\n```\n");
		const translatable = filterTranslatableSegments(segments);

		expect(translatable.length).toBe(0);
	});

	test("masked hydrateRoot body is not segment-eligible", () => {
		const { rest: body } = splitLeadingYamlFrontmatter(hydrateRootMd);
		const chunksManager = new ChunksManager("gpt-4o");

		const { maskedMarkdown } = maskLargeVerbatimFencedCodeBlocks(body, {
			estimateTokens: (markdown) => chunksManager.estimateTokenCount(markdown),
			minTokens: 80,
		});

		const { parseWarnings } = extractTranslatableBodySegments(maskedMarkdown);

		expect(isSegmentTranslationEligible(parseWarnings)).toBe(false);
		expect(parseWarnings.some((warning) => warning.startsWith("parse failed:"))).toBe(true);
	});

	test("filterTranslatableSegments includes policy segments when requested", () => {
		const { rest: body } = splitLeadingYamlFrontmatter(loadSegmentFixture("S5"));
		const { segments } = extractTranslatableBodySegments(body);
		const policyOnly = segments.filter((segment) => segment.kind === "policy");
		const translatable = filterTranslatableSegments(segments, true);

		expect(policyOnly.length).toBeGreaterThan(0);
		expect(translatable.some((segment) => segment.kind === "policy")).toBe(true);
	});

	test("reinsert with mock translations preserves fenced code from S1 body", () => {
		const { rest: body } = splitLeadingYamlFrontmatter(loadSegmentFixture("S1"));
		const { segments } = extractTranslatableBodySegments(body);
		const translatable = filterTranslatableSegments(segments);
		const translations: Record<string, string> = {};

		for (const segment of translatable) {
			translations[segment.id] = `${segment.sourceText}[t]`;
		}

		const output = reinsertSegments(body, translations, segments);

		expect(output).toContain("function Counter()");
		expect(output).toContain("[t]");
		expect(output).not.toContain("function Counter()[t]");
	});
});
