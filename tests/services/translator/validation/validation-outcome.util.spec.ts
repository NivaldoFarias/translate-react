import { describe, expect, test } from "bun:test";

import {
	BLOCKING_POST_TRANSLATION_GUARD_IDS,
	partitionPostTranslationValidationIssues,
} from "@/app/services/translator/validation/validation-outcome.util";
import { POST_TRANSLATION_GUARD_IDS } from "@/app/services/translator/validation/validation.constants";

describe("partitionPostTranslationValidationIssues", () => {
	test("treats contentRatio and nonEmptyContent as blocking", () => {
		const issues = [
			{
				guardId: POST_TRANSLATION_GUARD_IDS.contentRatio,
				message: "ratio low",
				retryHint: "keep full length",
			},
			{
				guardId: POST_TRANSLATION_GUARD_IDS.nonEmptyContent,
				message: "empty",
				retryHint: "return full document",
			},
			{
				guardId: POST_TRANSLATION_GUARD_IDS.mdxSlugPreserved,
				message: "slug missing",
				retryHint: "keep slug",
			},
		];

		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking).toHaveLength(2);
		expect(blocking.map((issue) => issue.guardId)).toEqual([
			POST_TRANSLATION_GUARD_IDS.contentRatio,
			POST_TRANSLATION_GUARD_IDS.nonEmptyContent,
		]);
		expect(advisory).toEqual([
			{ guardId: POST_TRANSLATION_GUARD_IDS.mdxSlugPreserved, hint: "keep slug" },
		]);
		expect(
			BLOCKING_POST_TRANSLATION_GUARD_IDS.has(POST_TRANSLATION_GUARD_IDS.mdxSlugPreserved),
		).toBe(false);
	});

	test("maps mechanical guard failures to advisory reviewer notices", () => {
		const issues = [
			{
				guardId: POST_TRANSLATION_GUARD_IDS.markdownLinksPreserved,
				message: "links missing",
				retryHint: "preserve every markdown link",
			},
			{
				guardId: POST_TRANSLATION_GUARD_IDS.fenceFunctionIdentifiers,
				message: "identifiers changed",
				retryHint: "keep `Foo` unchanged",
			},
		];

		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking).toEqual([]);
		expect(advisory).toEqual([
			{
				guardId: POST_TRANSLATION_GUARD_IDS.markdownLinksPreserved,
				hint: "preserve every markdown link",
			},
			{
				guardId: POST_TRANSLATION_GUARD_IDS.fenceFunctionIdentifiers,
				hint: "keep `Foo` unchanged",
			},
		]);
	});

	test("partitions mixed blocking and advisory issues", () => {
		const issues = [
			{
				guardId: POST_TRANSLATION_GUARD_IDS.contentRatio,
				message: "ratio high",
				retryHint: "shorten output",
			},
			{
				guardId: POST_TRANSLATION_GUARD_IDS.headingsPreserved,
				message: "headings mismatch",
				retryHint: "keep heading count",
			},
		];

		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking.map((issue) => issue.guardId)).toEqual([
			POST_TRANSLATION_GUARD_IDS.contentRatio,
		]);
		expect(advisory).toEqual([
			{ guardId: POST_TRANSLATION_GUARD_IDS.headingsPreserved, hint: "keep heading count" },
		]);
	});
});
