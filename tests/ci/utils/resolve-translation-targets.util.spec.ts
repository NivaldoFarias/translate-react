import { describe, expect, test } from "bun:test";

import { resolveTranslationTargets } from "@/ci/utils/resolve-translation-targets.util";

const TARGET_PATH = "src/content/reference/rsc/use-client.md";
const OTHER_PATH = "src/content/blog/post.md";

describe("resolveTranslationTargets", () => {
	test("returns no targets for blank manual input and unset environment", () => {
		expect(
			resolveTranslationTargets({
				filePathInput: "   ",
			}),
		).toEqual({
			path: "",
			hasTargetPaths: false,
		});
	});

	test("marks targeted runs from manual input and forwards trimmed path", () => {
		expect(
			resolveTranslationTargets({
				filePathInput: `  ${TARGET_PATH}  `,
			}),
		).toEqual({
			path: TARGET_PATH,
			hasTargetPaths: true,
		});
	});

	test("marks targeted runs from TRANSLATION_FILE_PATHS without manual input", () => {
		expect(
			resolveTranslationTargets({
				translationFilePathsEnv: OTHER_PATH,
			}),
		).toEqual({
			path: "",
			hasTargetPaths: true,
		});
	});

	test("merges manual input and environment sources", () => {
		expect(
			resolveTranslationTargets({
				filePathInput: TARGET_PATH,
				translationFilePathsEnv: OTHER_PATH,
			}),
		).toEqual({
			path: TARGET_PATH,
			hasTargetPaths: true,
		});
	});
});
