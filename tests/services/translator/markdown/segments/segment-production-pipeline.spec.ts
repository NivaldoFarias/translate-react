import { describe, expect, test } from "bun:test";

import { collectPostTranslationValidationIssues } from "@/app/services/translator/validation/guards";
import { partitionPostTranslationValidationIssues } from "@/app/services/translator/validation/validation-outcome.util";
import { POST_TRANSLATION_GUARD_IDS } from "@/app/services/translator/validation/validation.constants";

import hydrateRootMd from "@tests/fixtures/md/hydrateRoot.md" with { type: "text" };
import { loadSegmentFixture } from "@tests/fixtures/segment-extraction/load-fixture.util";
import { mockTranslateWithProductionCleanup } from "@tests/helpers/segment-round-trip.util";

const BODY_FIXTURE_IDS = ["S1", "S2", "S3", "S4", "S5", "S6", "S8", "S10"] as const;

/**
 * Appends a short suffix to translatable prose while preserving structural tokens.
 *
 * @param text Segment source text
 *
 * @returns Mock translation with unchanged fences, slugs, and link URLs
 */
function suffixMockTranslate(text: string) {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return text;
	}

	if (/^#{1,6}\s/.test(trimmed)) {
		return trimmed.replace(/^(#{1,6}\s+)(.+)$/, "$1$2ü");
	}

	return `${text}ü`;
}

describe("segment production cleanup pipeline", () => {
	test.each(BODY_FIXTURE_IDS.map((fixtureId) => [fixtureId] as const))(
		"fixture %s round-trips without structural blocking failures",
		(fixtureId: string) => {
			const source = loadSegmentFixture(fixtureId);
			const output = mockTranslateWithProductionCleanup(source, suffixMockTranslate);
			const issues = collectPostTranslationValidationIssues(source, output);
			const { blocking } = partitionPostTranslationValidationIssues(issues);

			expect(blocking.map((issue) => issue.guardId)).toEqual([]);
			expect(output).not.toMatch(/##\s+##/);
			expect(output).not.toMatch(/\S\{\/\*/);
		},
	);

	test("hydrateRoot excerpt round-trips without duplicated heading markers", () => {
		const output = mockTranslateWithProductionCleanup(hydrateRootMd, suffixMockTranslate);

		expect(output).not.toMatch(/##\s+##/);
		expect(output).not.toMatch(/\S\{\/\*/);
	});

	test("duplicate heading markers in segment output are sanitized", () => {
		const source = "## How to migrate {/*how-to-migrate*/}\n\nBody.";
		const output = mockTranslateWithProductionCleanup(source, (text) =>
			text.trim() === "How to migrate" ? "## Como migrar" : text,
		);

		expect(output).toContain("## Como migrar {/*how-to-migrate*/}");
		expect(output).not.toContain("## ##");
		expect(collectPostTranslationValidationIssues(source, output)).toEqual([]);
	});

	test("link label spacing survives variable-length translations", () => {
		const source = "Written by [Matt Carroll](https://example.com) and team.";
		const output = mockTranslateWithProductionCleanup(source, (text) =>
			text.includes("[") ? text : text.replace("Written by", "Escrito por"),
		);

		expect(output).toContain("por [Matt Carroll]");
		expect(mdxSpacingPasses(source, output)).toBe(true);
	});

	test("translated MDX slugs surface as advisory mdxSlugPreserved", () => {
		const source = "## Lifecycle {/*the-lifecycle-of-an-effect*/}\n\nBody.";
		const translated = "## Ciclo {/*o-ciclo-de-vida-de-um-efeito*/}\n\nCorpo.";
		const issues = collectPostTranslationValidationIssues(source, translated);
		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking).toEqual([]);
		expect(
			advisory.some((notice) => notice.guardId === POST_TRANSLATION_GUARD_IDS.mdxSlugPreserved),
		).toBe(true);
	});

	test("spacing regressions surface as advisory mdxSpacing", () => {
		const source = "## Title {/*slug*/}\n\npor [Name](url).";
		const malformedOutput = "## Título{/*slug*/}\n\npor[Name](url).";
		const issues = collectPostTranslationValidationIssues(source, malformedOutput);
		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking).toEqual([]);
		expect(
			advisory.some((notice) => notice.guardId === POST_TRANSLATION_GUARD_IDS.mdxSpacing),
		).toBe(true);
	});
});

/**
 * Returns true when the translated output has no mdxSpacing advisory issues.
 *
 * @param source Original markdown
 * @param translated Mock-translated output
 */
function mdxSpacingPasses(source: string, translated: string) {
	const issues = collectPostTranslationValidationIssues(source, translated);
	return !issues.some((issue) => issue.guardId === POST_TRANSLATION_GUARD_IDS.mdxSpacing);
}
