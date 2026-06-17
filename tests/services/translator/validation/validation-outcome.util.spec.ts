import { describe, expect, test } from "bun:test";

import {
	BLOCKING_POST_TRANSLATION_GUARD_IDS,
	partitionPostTranslationValidationIssues,
} from "@/app/services/translator/validation/validation-outcome.util";
import { PostTranslationGuardId } from "@/app/services/translator/validation/validation.constants";

describe("partitionPostTranslationValidationIssues", () => {
	test("treats contentRatio and nonEmptyContent as blocking", () => {
		const issues = [
			{
				guardId: PostTranslationGuardId.contentRatio,
				message: "ratio low",
				retryHint: "keep full length",
			},
			{
				guardId: PostTranslationGuardId.nonEmptyContent,
				message: "empty",
				retryHint: "return full document",
			},
			{
				guardId: PostTranslationGuardId.mdxSlugPreserved,
				message: "slug missing",
				retryHint: "keep slug",
			},
		];

		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking).toHaveLength(2);
		expect(blocking.map((issue) => issue.guardId)).toEqual([
			PostTranslationGuardId.contentRatio,
			PostTranslationGuardId.nonEmptyContent,
		]);
		expect(advisory).toEqual([
			{ guardId: PostTranslationGuardId.mdxSlugPreserved, hint: "keep slug" },
		]);
		expect(BLOCKING_POST_TRANSLATION_GUARD_IDS.has(PostTranslationGuardId.mdxSlugPreserved)).toBe(
			false,
		);
	});

	test("maps mechanical guard failures to advisory reviewer notices", () => {
		const issues = [
			{
				guardId: PostTranslationGuardId.markdownLinksPreserved,
				message: "links missing",
				retryHint: "preserve every markdown link",
			},
			{
				guardId: PostTranslationGuardId.fenceFunctionIdentifiers,
				message: "identifiers changed",
				retryHint: "keep `Foo` unchanged",
			},
		];

		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking).toEqual([]);
		expect(advisory).toEqual([
			{
				guardId: PostTranslationGuardId.markdownLinksPreserved,
				hint: "preserve every markdown link",
			},
			{ guardId: PostTranslationGuardId.fenceFunctionIdentifiers, hint: "keep `Foo` unchanged" },
		]);
	});

	test("partitions mixed blocking and advisory issues", () => {
		const issues = [
			{
				guardId: PostTranslationGuardId.contentRatio,
				message: "ratio high",
				retryHint: "shorten output",
			},
			{
				guardId: PostTranslationGuardId.headingsPreserved,
				message: "headings mismatch",
				retryHint: "keep heading count",
			},
		];

		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking.map((issue) => issue.guardId)).toEqual([PostTranslationGuardId.contentRatio]);
		expect(advisory).toEqual([
			{ guardId: PostTranslationGuardId.headingsPreserved, hint: "keep heading count" },
		]);
	});
});
