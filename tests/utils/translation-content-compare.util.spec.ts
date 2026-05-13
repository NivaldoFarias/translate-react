import { describe, expect, test } from "bun:test";

import { TranslationFile } from "@/services/translator/";
import {
	isTranslationEquivalentToCurrentBlob,
	normalizeForTranslationCompare,
} from "@/utils/translation-content-compare.util";

describe("translation-content-compare.util", () => {
	describe("normalizeForTranslationCompare", () => {
		test("converts CRLF to LF", () => {
			expect(normalizeForTranslationCompare("a\r\nb")).toBe("a\nb");
		});
	});

	describe("isTranslationEquivalentToCurrentBlob", () => {
		test("returns true when normalized strings match", () => {
			const file = new TranslationFile("line\r\n", "x.md", "src/x.md", "sha");

			expect(isTranslationEquivalentToCurrentBlob(file, "line\n")).toBe(true);
		});

		test("returns false when content differs", () => {
			const file = new TranslationFile("a", "x.md", "src/x.md", "sha");

			expect(isTranslationEquivalentToCurrentBlob(file, "b")).toBe(false);
		});
	});
});
