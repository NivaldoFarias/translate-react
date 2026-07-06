import { afterEach, describe, expect, test } from "bun:test";

import { applyTranslationCliOverrides } from "@/app/utils/translation-cli.util";

const TARGET_PATH = "src/content/reference/rsc/use-client.md";
const OTHER_PATH = "src/content/blog/post.md";

describe("applyTranslationCliOverrides", () => {
	afterEach(() => {
		delete import.meta.env["TRANSLATION_FILE_PATHS"];
	});

	test("sets TRANSLATION_FILE_PATHS from a comma-separated --file value", () => {
		applyTranslationCliOverrides(["--file", `${TARGET_PATH},${OTHER_PATH}`]);

		expect(import.meta.env["TRANSLATION_FILE_PATHS"]).toBe(`${TARGET_PATH},${OTHER_PATH}`);
	});

	test("merges repeated --file flags into a deduplicated TRANSLATION_FILE_PATHS value", () => {
		applyTranslationCliOverrides(["--file", TARGET_PATH, "--file", OTHER_PATH, "-f", TARGET_PATH]);

		expect(import.meta.env["TRANSLATION_FILE_PATHS"]).toBe(`${TARGET_PATH},${OTHER_PATH}`);
	});

	test("does not set TRANSLATION_FILE_PATHS when --file is omitted", () => {
		applyTranslationCliOverrides(["--lang", "ru"]);

		expect(import.meta.env["TRANSLATION_FILE_PATHS"]).toBeUndefined();
	});
});
