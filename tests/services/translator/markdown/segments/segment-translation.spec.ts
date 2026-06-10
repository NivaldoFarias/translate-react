import { describe, expect, test } from "bun:test";

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
import { loadSpikeFixture } from "@/app/services/translator/markdown/segments/spike-corpus.util";

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

	test("reinsert with mock translations preserves fenced code from S1 body", () => {
		const { rest: body } = splitLeadingYamlFrontmatter(loadSpikeFixture("S1"));
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
