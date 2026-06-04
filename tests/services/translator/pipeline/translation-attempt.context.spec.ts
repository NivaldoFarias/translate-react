import { describe, expect, test } from "bun:test";

import {
	emptyTranslationAttemptContext,
	translationAttemptContextFromHints,
	translationAttemptContextFromMaintainerReview,
} from "@/app/services/translator/pipeline/translation-attempt.context";

describe("translationAttemptContextFromHints", () => {
	test("merges new hints with prior validation hints without dropping earlier guards", () => {
		const base = translationAttemptContextFromHints(["keep links"]);

		const merged = translationAttemptContextFromHints(["keep function Foo"], base);

		expect(merged.validationRetryHints).toEqual(["keep links", "keep function Foo"]);
	});

	test("deduplicates identical hints", () => {
		const base = translationAttemptContextFromHints(["keep links"]);
		const merged = translationAttemptContextFromHints(["keep links", "keep links"], base);

		expect(merged.validationRetryHints).toEqual(["keep links"]);
	});

	test("preserves maintainer review comments from the base context", () => {
		const base = translationAttemptContextFromMaintainerReview(["fix heading case"]);
		const merged = translationAttemptContextFromHints(["preserve links"], base);

		expect(merged.maintainerReviewComments).toEqual(["fix heading case"]);
		expect(merged.validationRetryHints).toEqual(["preserve links"]);
	});

	test("ignores empty hint strings", () => {
		const merged = translationAttemptContextFromHints(["", "  ", "keep links"]);

		expect(merged.validationRetryHints).toEqual(["keep links"]);
	});
});

describe("emptyTranslationAttemptContext", () => {
	test("starts with no validation hints", () => {
		expect(emptyTranslationAttemptContext().validationRetryHints).toEqual([]);
	});
});
