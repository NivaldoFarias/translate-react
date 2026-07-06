import { describe, expect, test } from "bun:test";

import {
	filterToTranslationTargets,
	findUnsafeTranslationTargetPaths,
	isForceRetranslatePath,
	parseTranslationFilePaths,
	shouldPreserveOpenPullRequestOnRefresh,
} from "@/app/utils/translation-target.util";

import { createMockPullRequestListItem } from "@tests/fixtures";

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

describe("isForceRetranslatePath", () => {
	test("returns false when no target paths are configured", () => {
		expect(isForceRetranslatePath(TARGET_PATH, [])).toBe(false);
	});

	test("returns true only for listed target paths", () => {
		const targets = [TARGET_PATH];

		expect(isForceRetranslatePath(TARGET_PATH, targets)).toBe(true);
		expect(isForceRetranslatePath(OTHER_PATH, targets)).toBe(false);
	});
});

describe("shouldPreserveOpenPullRequestOnRefresh", () => {
	test("returns false when there is no open pull request", () => {
		expect(
			shouldPreserveOpenPullRequestOnRefresh(TARGET_PATH, {
				pullRequest: undefined,
				invalidReason: "no_open_pr",
			}),
		).toBe(false);
	});

	test("returns true for out-of-sync pull requests", () => {
		expect(
			shouldPreserveOpenPullRequestOnRefresh(TARGET_PATH, {
				pullRequest: createMockPullRequestListItem(42),
				invalidReason: "out_of_sync",
			}),
		).toBe(true);
	});

	test("returns true for configured force-retranslate targets with an open pull request", () => {
		const targets = [TARGET_PATH];

		expect(
			shouldPreserveOpenPullRequestOnRefresh(
				TARGET_PATH,
				{
					pullRequest: createMockPullRequestListItem(1173),
					invalidReason: undefined,
				},
				targets,
			),
		).toBe(true);
	});

	test("returns false for valid pull requests that are not force-retranslate targets", () => {
		expect(
			shouldPreserveOpenPullRequestOnRefresh(
				OTHER_PATH,
				{
					pullRequest: createMockPullRequestListItem(99),
					invalidReason: undefined,
				},
				[TARGET_PATH],
			),
		).toBe(false);
	});
});

describe("filterToTranslationTargets", () => {
	test("returns all files when no target paths are configured", () => {
		const files = [{ path: TARGET_PATH }, { path: OTHER_PATH }];

		expect(filterToTranslationTargets(files, [])).toEqual(files);
	});

	test("returns only files that match configured target paths", () => {
		const files = [{ path: TARGET_PATH }, { path: OTHER_PATH }];

		expect(filterToTranslationTargets(files, [TARGET_PATH])).toEqual([{ path: TARGET_PATH }]);
	});
});

describe("findUnsafeTranslationTargetPaths", () => {
	test("flags paths outside safe translatable markdown scope", () => {
		expect(findUnsafeTranslationTargetPaths(["../secret.md", TARGET_PATH])).toEqual([
			"../secret.md",
		]);
	});
});
