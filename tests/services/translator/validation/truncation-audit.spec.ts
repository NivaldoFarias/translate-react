import { describe, expect, test } from "bun:test";

import { collectPostTranslationValidationIssues } from "@/app/services/translator/validation/guards";
import { contentRatioGuard } from "@/app/services/translator/validation/guards/content-ratio.guard";
import { headingCountPreservedGuard } from "@/app/services/translator/validation/guards/structural-integrity.guard";
import { partitionPostTranslationValidationIssues } from "@/app/services/translator/validation/validation-outcome.util";
import { POST_TRANSLATION_GUARD_IDS } from "@/app/services/translator/validation/validation.constants";

describe("truncated tutorial content audit (#1201 class)", () => {
	const source = `# Passing Data Deeply\n\n${"## Section\n\nParagraph with enough prose to model a long tutorial page.\n\n".repeat(80)}`;

	test("contentRatio blocks severely truncated output", () => {
		const truncated = source.slice(0, Math.floor(source.length * 0.44));

		expect(contentRatioGuard(source, truncated)?.guardId).toBe(
			POST_TRANSLATION_GUARD_IDS.contentRatio,
		);
	});

	test("headingCountPreserved blocks partial section loss", () => {
		const translated = source.split("\n\n").slice(0, 40).join("\n\n");

		expect(headingCountPreservedGuard(source, translated)?.guardId).toBe(
			POST_TRANSLATION_GUARD_IDS.headingCountPreserved,
		);
	});

	test("partition keeps structural guards advisory while contentRatio blocks", () => {
		const truncated = source.slice(0, Math.floor(source.length * 0.44));
		const issues = collectPostTranslationValidationIssues(source, truncated);
		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(
			blocking.some((issue) => issue.guardId === POST_TRANSLATION_GUARD_IDS.contentRatio),
		).toBe(true);
		expect(
			advisory.some(
				(notice) => notice.guardId === POST_TRANSLATION_GUARD_IDS.headingCountPreserved,
			),
		).toBe(true);
	});
});
