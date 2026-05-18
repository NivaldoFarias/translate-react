import { describe, expect, test } from "bun:test";

import type { RunnerServiceDependencies } from "@/services/runner/runner.types";

import { TranslationBatchManager } from "@/services/runner/managers/translation-batch.manager";
import { localeService } from "@/services/";

import { createMockPullRequestListItem, createTranslationFileFixture } from "@tests/fixtures";
import {
	createMockGitHubService,
	createMockLanguageCacheService,
	createMockLanguageDetectorService,
	createMockTranslatorService,
} from "@tests/mocks";

function createTestTranslationBatchManager(overrides: Partial<RunnerServiceDependencies> = {}) {
	return new TranslationBatchManager(
		{
			github: overrides.github ?? createMockGitHubService(),
			translator: overrides.translator ?? createMockTranslatorService(),
			languageCache: overrides.languageCache ?? createMockLanguageCacheService(),
			locale: overrides.locale ?? localeService,
			languageDetector: overrides.languageDetector ?? createMockLanguageDetectorService(),
		} as RunnerServiceDependencies,
		new Map(),
		Date.now(),
		{ newIssueChooserUrl: "https://github.com/example/example/issues/new/choose" },
	);
}

describe("TranslationBatchManager", () => {
	describe("processBatches", () => {
		test("skips translate and commit when open pull request is mergeable", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const existingPR = createMockPullRequestListItem(1082);

			github.findPullRequestByBranch.mockResolvedValue(existingPR);
			github.checkPullRequestStatus.mockResolvedValue({
				hasConflicts: false,
				mergeable: true,
				needsUpdate: false,
				mergeableState: "clean",
				createdBy: "translate-react-bot",
			});

			const manager = createTestTranslationBatchManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				translator: translator as unknown as RunnerServiceDependencies["translator"],
			});
			const file = createTranslationFileFixture({
				path: "src/content/blog/2021/12/17/react-conf-2021-recap.md",
				filename: "react-conf-2021-recap.md",
			});

			const results = await manager.processBatches([file], 1);

			expect(translator.translateContent).not.toHaveBeenCalled();
			expect(github.commitTranslation).not.toHaveBeenCalled();
			expect(github.createBranch).not.toHaveBeenCalled();
			expect(results.get(file.filename)?.pullRequest).toEqual(existingPR);
		});

		test("translates when no open pull request exists for the translation branch", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();

			github.findPullRequestByBranch.mockResolvedValue(undefined);

			const manager = createTestTranslationBatchManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				translator: translator as unknown as RunnerServiceDependencies["translator"],
			});
			const file = createTranslationFileFixture({
				path: "src/content/new-page.md",
				filename: "new-page.md",
			});

			await manager.processBatches([file], 1);

			expect(translator.translateContent).toHaveBeenCalled();
			expect(github.commitTranslation).toHaveBeenCalled();
		});
	});
});
