import { describe, expect, test } from "bun:test";

import {
	BLOCKING_POST_TRANSLATION_GUARD_IDS,
	partitionPostTranslationValidationIssues,
} from "@/app/services/translator/validation/validation-outcome.util";

describe("partitionPostTranslationValidationIssues", () => {
	test("treats contentRatio and nonEmptyContent as blocking", () => {
		const issues = [
			{
				guardId: "contentRatio",
				message: "ratio low",
				retryHint: "keep full length",
			},
			{
				guardId: "nonEmptyContent",
				message: "empty",
				retryHint: "return full document",
			},
		];

		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking).toHaveLength(2);
		expect(advisory).toEqual([]);
		expect(BLOCKING_POST_TRANSLATION_GUARD_IDS.has("contentRatio")).toBe(true);
	});

	test("maps mechanical guard failures to advisory reviewer notices", () => {
		const issues = [
			{
				guardId: "markdownLinksPreserved",
				message: "links missing",
				retryHint: "preserve every markdown link",
			},
			{
				guardId: "fenceFunctionIdentifiers",
				message: "identifiers changed",
				retryHint: "keep `Foo` unchanged",
			},
		];

		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking).toEqual([]);
		expect(advisory).toEqual([
			{ guardId: "markdownLinksPreserved", hint: "preserve every markdown link" },
			{ guardId: "fenceFunctionIdentifiers", hint: "keep `Foo` unchanged" },
		]);
	});

	test("partitions mixed blocking and advisory issues", () => {
		const issues = [
			{
				guardId: "contentRatio",
				message: "ratio high",
				retryHint: "shorten output",
			},
			{
				guardId: "headingsPreserved",
				message: "headings mismatch",
				retryHint: "keep heading count",
			},
		];

		const { blocking, advisory } = partitionPostTranslationValidationIssues(issues);

		expect(blocking.map((issue) => issue.guardId)).toEqual(["contentRatio"]);
		expect(advisory).toEqual([{ guardId: "headingsPreserved", hint: "keep heading count" }]);
	});
});
