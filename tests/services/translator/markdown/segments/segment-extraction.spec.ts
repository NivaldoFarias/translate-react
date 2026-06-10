import { describe, expect, test } from "bun:test";

import {
	compareCommentExtractionMethods,
	extractSegments,
	filterTranslatableSegments,
	formatCorpusTable,
	identityRoundTrip,
	loadSpikeFixture,
	runSpikeCorpus,
	SEGMENT_INTEGRATION_ANALYSIS,
	SEGMENT_SPIKE_TOOLING_NOTE,
	simulateGuardOutcomes,
} from "@/app/services/translator/markdown/segments";
import { evaluateToolingOnFixture } from "@/app/services/translator/markdown/segments/tooling-eval.util";

describe("segment extraction spike", () => {
	test("documents remark-mdx tooling choice", () => {
		expect(SEGMENT_SPIKE_TOOLING_NOTE).toContain("remark-mdx");
	});

	test("identity round-trip passes for S1 baseline prose", () => {
		const source = loadSpikeFixture("S1");
		const { ok } = identityRoundTrip(source);

		expect(ok).toBe(true);
	});

	test("extracts link label text but not URLs in S2", () => {
		const source = loadSpikeFixture("S2");
		const { segments } = extractSegments(source);
		const labels = filterTranslatableSegments(segments).map((segment) => segment.sourceText);

		expect(labels.some((text) => text.includes("React Conf"))).toBe(true);
		expect(segments.some((segment) => segment.sourceText.includes("https://"))).toBe(false);
	});

	test("does not mark fence function bodies as translate segments in S3", () => {
		const source = loadSpikeFixture("S3");
		const { segments } = extractSegments(source);

		expect(
			filterTranslatableSegments(segments).some((segment) =>
				segment.sourceText.includes("function foo"),
			),
		).toBe(false);
	});

	test("extracts fence comments as policy segments in S5", () => {
		const source = loadSpikeFixture("S5");
		const { segments } = extractSegments(source);
		const comments = segments.filter((segment) => segment.path.includes("/comment"));

		expect(comments.length).toBeGreaterThanOrEqual(2);
		expect(comments.every((segment) => segment.kind === "policy")).toBe(true);
	});

	test("assigns distinct ids to duplicate sentences in S8", () => {
		const source = loadSpikeFixture("S8");
		const { segments } = extractSegments(source);
		const duplicates = filterTranslatableSegments(segments).filter((segment) =>
			segment.sourceText.includes("React keeps state between renders"),
		);

		expect(duplicates.length).toBe(2);
		expect(duplicates[0]?.id).not.toBe(duplicates[1]?.id);
	});

	test("identity round-trip preserves markdown link URLs in S2", () => {
		const source = loadSpikeFixture("S2");
		const { ok, output } = identityRoundTrip(source);
		const sourceUrls = source.match(/\]\([^)]+\)/g) ?? [];
		const outputUrls = output.match(/\]\([^)]+\)/g) ?? [];

		expect(ok).toBe(true);
		expect(outputUrls).toEqual(sourceUrls);
	});

	test("guard simulation shows link guard prevented for S2", () => {
		const source = loadSpikeFixture("S2");
		const rows = simulateGuardOutcomes(source);
		const linkRow = rows.find((row) => row.guardId === "markdownLinksPreserved");

		expect(linkRow?.firesOnSimulatedBadFullBody).toBe(true);
		expect(linkRow?.preventedBySegmentFreeze).toBe(true);
	});

	test("guard simulation shows structural guards prevented for S3 fence corruption", () => {
		const source = loadSpikeFixture("S3");
		const rows = simulateGuardOutcomes(source);
		const fenceRow = rows.find((row) => row.guardId === "fenceFunctionIdentifiers");

		expect(fenceRow?.firesOnSimulatedBadFullBody).toBe(true);
		expect(fenceRow?.preventedBySegmentFreeze).toBe(true);
	});

	test("TypeScript comment parser finds at least as many comments as regex on S5", () => {
		const source = loadSpikeFixture("S5");
		const fenceMatch = /```js\n([\s\S]*?)```/.exec(source);
		const fenceBody = fenceMatch?.[1] ?? "";
		const comparison = compareCommentExtractionMethods(fenceBody);

		expect(comparison.parserCount).toBeGreaterThanOrEqual(2);
	});

	test("corpus table covers S1 through S10", () => {
		const metrics = runSpikeCorpus();
		const table = formatCorpusTable(metrics);

		expect(metrics).toHaveLength(10);
		expect(metrics.every((row) => row.identityRoundTrip)).toBe(true);
		expect(table).toContain("| S9 |");
		expect(table).toContain("| S10 |");
	});

	test("remark mdast parse succeeds on hydrateRoot fixture for tooling eval", async () => {
		const result = await evaluateToolingOnFixture("hydrateRoot.md");

		expect(result.remarkNodeCount).toBeGreaterThan(0);
		expect(result.remarkError).toBeUndefined();
	});

	test("integration analysis recommends hybrid with L t-shirt size", () => {
		expect(SEGMENT_INTEGRATION_ANALYSIS.recommendation.decision).toBe("hybrid");
		expect(SEGMENT_INTEGRATION_ANALYSIS.recommendation.tShirtSize).toBe("L");
	});
});
