import { describe, expect, test } from "bun:test";

import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationBatchManager } from "@/app/services/runner/workflow/translation-batch.manager";

import {
	createGitBranchRefResponse,
	createMockPullRequestListItem,
	createPullRequestStatusFixture,
	createTranslatedLanguageAnalysis,
	createTranslationFileFixture,
} from "@tests/fixtures";
import { buildRunnerServiceDependencies } from "@tests/helpers/runner-dependencies.harness";
import { useTranslationTargetPaths } from "@tests/helpers/translation-target.harness";
import {
	createMockGitHubService,
	createMockLanguageDetectorService,
	createMockTranslatorService,
} from "@tests/mocks";

const TARGET_PATH = "src/content/reference/rsc/use-client.md";

function createTestTranslationBatchManager(
	overrides: Parameters<typeof buildRunnerServiceDependencies>[0] = {},
) {
	return new TranslationBatchManager(
		buildRunnerServiceDependencies(overrides),
		new Map(),
		Date.now(),
	);
}

describe("TranslationBatchManager targeted re-translation", () => {
	useTranslationTargetPaths(TARGET_PATH);

	test("re-translates a valid open pull request when the file is a configured target", async () => {
		const github = createMockGitHubService();
		const translator = createMockTranslatorService();
		const languageDetector = createMockLanguageDetectorService();
		const existingPR = createMockPullRequestListItem(1173);

		github.findPullRequestByBranch.mockResolvedValue(existingPR);
		github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
		github.getForkFileContentAtBranch.mockResolvedValue(
			"Достаточно длинный русский текст для детекции языка.",
		);
		github.getBranch.mockResolvedValue(createGitBranchRefResponse());
		languageDetector.analyzeLanguage.mockResolvedValue(createTranslatedLanguageAnalysis());

		const manager = createTestTranslationBatchManager({
			github,
			translator,
			languageDetector,
		});
		const file = createTranslationFileFixture({
			path: TARGET_PATH,
			filename: "use-client.md",
		});

		const results = await manager.processBatches([file], 1);

		expect(translator.translateContent).toHaveBeenCalled();
		expect(github.refreshTranslationBranchPreservePr).toHaveBeenCalled();
		expect(github.closePullRequest).not.toHaveBeenCalled();
		expect(github.updatePullRequestBody).toHaveBeenCalled();
		expect(results.get(file.filename)?.pullRequest).toEqual(existingPR);
		expect(results.get(file.filename)?.pullRequestProgress).toBe(PullRequestProgressAction.Reused);
	});

	test("still skips translate when the file is not a configured target", async () => {
		const github = createMockGitHubService();
		const translator = createMockTranslatorService();
		const languageDetector = createMockLanguageDetectorService();
		const existingPR = createMockPullRequestListItem(1082);

		github.findPullRequestByBranch.mockResolvedValue(existingPR);
		github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
		github.getForkFileContentAtBranch.mockResolvedValue(
			"Conteúdo em português suficientemente longo para detecção de idioma.",
		);
		languageDetector.analyzeLanguage.mockResolvedValue(createTranslatedLanguageAnalysis());

		const manager = createTestTranslationBatchManager({
			github,
			translator,
			languageDetector,
		});
		const file = createTranslationFileFixture({
			path: "src/content/blog/post.md",
			filename: "post.md",
		});

		await manager.processBatches([file], 1);

		expect(translator.translateContent).not.toHaveBeenCalled();
		expect(github.refreshTranslationBranchPreservePr).not.toHaveBeenCalled();
	});
});
