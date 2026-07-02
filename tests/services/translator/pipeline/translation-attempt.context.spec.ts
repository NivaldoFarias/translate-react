import { describe, expect, test } from "bun:test";

import { emptyTranslationAttemptContext } from "@/app/services/translator/pipeline/translation-attempt.context";

describe("emptyTranslationAttemptContext", () => {
	test("returns an empty object", () => {
		expect(emptyTranslationAttemptContext()).toEqual({});
	});
});
