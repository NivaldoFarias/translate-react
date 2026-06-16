import { describe, expect, test } from "bun:test";

import { splitLeadingYamlFrontmatter } from "@/app/services/translator/markdown/frontmatter";
import {
	extractTranslatableBodySegments,
	filterTranslatableSegments,
	isSegmentTranslationEligible,
} from "@/app/services/translator/markdown/segments";

import { hydrateRootMd } from "@tests/fixtures/react-docs-fixtures";
import { loadSegmentFixture } from "@tests/fixtures/segment-extraction/load-fixture.util";
import { compareCommentExtractionMethods } from "@tests/helpers/segment-fence-comments.util";
import { simulateGuardOutcomes } from "@tests/helpers/segment-guard-simulation.util";
import { identityRoundTrip } from "@tests/helpers/segment-round-trip.util";

describe("markdown segment extraction", () => {
	test("identity round-trip passes for baseline prose fixture", () => {
		const source = loadSegmentFixture("S1");
		const { ok } = identityRoundTrip(source);

		expect(ok).toBe(true);
	});

	test("translates link labels without URLs", () => {
		const source = loadSegmentFixture("S2");
		const { rest: body } = splitLeadingYamlFrontmatter(source);
		const { segments } = extractTranslatableBodySegments(body);
		const labels = filterTranslatableSegments(segments).map((segment) => segment.sourceText);

		expect(labels.some((text) => text.includes("React Conf"))).toBe(true);
		expect(segments.some((segment) => segment.sourceText.includes("https://"))).toBe(false);
	});

	test("does not mark fence function bodies as translatable", () => {
		const source = loadSegmentFixture("S3");
		const { rest: body } = splitLeadingYamlFrontmatter(source);
		const { segments } = extractTranslatableBodySegments(body);

		expect(
			filterTranslatableSegments(segments).some((segment) =>
				segment.sourceText.includes("function foo"),
			),
		).toBe(false);
	});

	test("extracts fence comments as policy segments", () => {
		const source = loadSegmentFixture("S5");
		const { rest: body } = splitLeadingYamlFrontmatter(source);
		const { segments } = extractTranslatableBodySegments(body);
		const comments = segments.filter((segment) => segment.path.includes("/comment"));

		expect(comments.length).toBeGreaterThanOrEqual(2);
		expect(comments.every((segment) => segment.kind === "policy")).toBe(true);
	});

	test("assigns distinct ids to duplicate prose", () => {
		const source = loadSegmentFixture("S8");
		const { rest: body } = splitLeadingYamlFrontmatter(source);
		const { segments } = extractTranslatableBodySegments(body);
		const duplicates = filterTranslatableSegments(segments).filter((segment) =>
			segment.sourceText.includes("React keeps state between renders"),
		);

		expect(duplicates.length).toBe(2);
		expect(duplicates[0]?.id).not.toBe(duplicates[1]?.id);
	});

	test("identity round-trip preserves markdown link URLs", () => {
		const source = loadSegmentFixture("S2");
		const { ok, output } = identityRoundTrip(source);
		const sourceUrls = source.match(/\]\([^)]+\)/g) ?? [];
		const outputUrls = output.match(/\]\([^)]+\)/g) ?? [];

		expect(ok).toBe(true);
		expect(outputUrls).toEqual(sourceUrls);
	});

	test("link guard fires on simulated bad full-body but not segment freeze", () => {
		const source = loadSegmentFixture("S2");
		const rows = simulateGuardOutcomes(source);
		const linkRow = rows.find((row) => row.guardId === "markdownLinksPreserved");

		expect(linkRow?.firesOnSimulatedBadFullBody).toBe(true);
		expect(linkRow?.preventedBySegmentFreeze).toBe(true);
	});

	test("fence identifier guard fires on simulated bad full-body but not segment freeze", () => {
		const source = loadSegmentFixture("S3");
		const rows = simulateGuardOutcomes(source);
		const fenceRow = rows.find((row) => row.guardId === "fenceFunctionIdentifiers");

		expect(fenceRow?.firesOnSimulatedBadFullBody).toBe(true);
		expect(fenceRow?.preventedBySegmentFreeze).toBe(true);
	});

	test("TypeScript comment parser finds at least as many comments as regex on fence-comments fixture", () => {
		const source = loadSegmentFixture("S5");
		const fenceMatch = /```js\n([\s\S]*?)```/.exec(source);
		const fenceBody = fenceMatch?.[1] ?? "";
		const comparison = compareCommentExtractionMethods(fenceBody);

		expect(comparison.parserCount).toBeGreaterThanOrEqual(2);
	});

	test("parses hydrateRoot body and returns segments when unmasked", () => {
		const { rest: body } = splitLeadingYamlFrontmatter(hydrateRootMd);
		const { segments, parseWarnings } = extractTranslatableBodySegments(body);

		expect(isSegmentTranslationEligible(parseWarnings)).toBe(true);
		expect(filterTranslatableSegments(segments).length).toBeGreaterThan(0);
	});
});
