import { describe, expect, test } from "bun:test";

import {
	emptyTranslationAttemptContext,
	translationAttemptContextFromMaintainerReview,
} from "@/app/services/translator/pipeline/translation-attempt.context";

describe("translationAttemptContextFromMaintainerReview", () => {
	test("stores maintainer comment bodies on the context", () => {
		const context = translationAttemptContextFromMaintainerReview([
			"fix heading case",
			"restore link targets",
		]);

		expect(context.maintainerReviewComments).toEqual(["fix heading case", "restore link targets"]);
	});
});

describe("emptyTranslationAttemptContext", () => {
	test("has no maintainer review comments", () => {
		expect(emptyTranslationAttemptContext().maintainerReviewComments).toBeUndefined();
	});
});
