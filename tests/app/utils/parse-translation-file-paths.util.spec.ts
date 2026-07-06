import { describe, expect, test } from "bun:test";

import {
	collectTranslationFilePaths,
	parseTranslationFilePaths,
} from "@/app/utils/parse-translation-file-paths.util";

const TARGET_PATH = "src/content/reference/rsc/use-client.md";
const OTHER_PATH = "src/content/blog/post.md";

describe("parseTranslationFilePaths", () => {
	test("returns empty array when input is unset or blank", () => {
		expect(parseTranslationFilePaths(undefined)).toEqual([]);
		expect(parseTranslationFilePaths("")).toEqual([]);
		expect(parseTranslationFilePaths("   ")).toEqual([]);
	});

	test("parses comma-separated paths and trims whitespace", () => {
		expect(parseTranslationFilePaths(` ${TARGET_PATH} , ${OTHER_PATH} `)).toEqual([
			TARGET_PATH,
			OTHER_PATH,
		]);
	});

	test("deduplicates repeated paths while preserving first-seen order", () => {
		expect(parseTranslationFilePaths(`${TARGET_PATH},${TARGET_PATH},${OTHER_PATH}`)).toEqual([
			TARGET_PATH,
			OTHER_PATH,
		]);
	});
});

describe("collectTranslationFilePaths", () => {
	test("merges input and environment sources without duplicates", () => {
		expect(collectTranslationFilePaths(` ${TARGET_PATH} `, `${TARGET_PATH},${OTHER_PATH}`)).toEqual(
			[TARGET_PATH, OTHER_PATH],
		);
	});

	test("returns empty array when all sources are blank", () => {
		expect(collectTranslationFilePaths(undefined, "   ", "")).toEqual([]);
	});
});
