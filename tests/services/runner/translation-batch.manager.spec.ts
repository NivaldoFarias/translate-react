import { describe, expect, test } from "bun:test";

import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationBatchManager } from "@/app/services/runner/workflow/translation-batch.manager";
import { MAX_CONSECUTIVE_FAILURES } from "@/app/services/runner/workflow/workflow.constants";
import { ApplicationError, ErrorCode, isCircuitBreakerError } from "@/shared/errors/";

import {
	createGitBranchRefResponse,
	createMockPullRequestListItem,
	createMockPullRequestReviewSnapshot,
	createPullRequestStatusFixture,
	createTranslatedLanguageAnalysis,
	createTranslationFileFixture,
	createUntranslatedLanguageAnalysis,
} from "@tests/fixtures";
import { buildRunnerServiceDependencies } from "@tests/helpers/runner-dependencies.harness";
import {
	createMockGitHubService,
	createMockLanguageDetectorService,
	createMockTranslatorService,
} from "@tests/mocks";

function createTestTranslationBatchManager(
	overrides: Parameters<typeof buildRunnerServiceDependencies>[0] = {},
) {
	return new TranslationBatchManager(
		buildRunnerServiceDependencies(overrides),
		new Map(),
		Date.now(),
	);
}

describe("TranslationBatchManager", () => {
	describe("processBatches", () => {
		test("skips translate and commit when open translation pull request is valid", async () => {
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
				path: "src/content/blog/2021/12/17/react-conf-2021-recap.md",
				filename: "react-conf-2021-recap.md",
			});

			const results = await manager.processBatches([file], 1);

			expect(translator.translateContent).not.toHaveBeenCalled();
			expect(github.commitTranslation).not.toHaveBeenCalled();
			expect(github.createBranch).not.toHaveBeenCalled();
			expect(results.get(file.filename)?.pullRequest).toEqual(existingPR);
			expect(results.get(file.filename)?.pullRequestProgress).toBe(
				PullRequestProgressAction.Reused,
			);
		});

		test("resets branch and translates when no valid open translation pull request exists", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const languageDetector = createMockLanguageDetectorService();

			github.findPullRequestByBranch.mockResolvedValue(undefined);
			github.getBranch.mockResolvedValue(undefined);
			languageDetector.analyzeLanguage.mockResolvedValue(createUntranslatedLanguageAnalysis());

			const manager = createTestTranslationBatchManager({
				github,
				translator,
				languageDetector,
			});
			const file = createTranslationFileFixture({
				path: "src/content/new-page.md",
				filename: "new-page.md",
			});

			await manager.processBatches([file], 1);

			expect(translator.translateContent).toHaveBeenCalled();
			expect(github.createBranch).toHaveBeenCalled();
			expect(github.commitTranslation).toHaveBeenCalled();
			expect(github.createPullRequest).toHaveBeenCalled();
		});

		test("refreshes branch without closing pull request when translation is out of sync", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const languageDetector = createMockLanguageDetectorService();
			const existingPR = createMockPullRequestListItem(1301);

			github.findPullRequestByBranch.mockResolvedValue(existingPR);
			github.checkPullRequestStatus.mockResolvedValue(
				createPullRequestStatusFixture({
					hasConflicts: true,
					mergeable: false,
					needsUpdate: true,
					mergeableState: "dirty",
				}),
			);
			github.getForkFileContentAtBranch.mockResolvedValue(
				"Conteúdo em português suficientemente longo para detecção de idioma.",
			);
			github.getBranch.mockResolvedValue(createGitBranchRefResponse());
			languageDetector.analyzeLanguage.mockResolvedValue(createTranslatedLanguageAnalysis());

			const manager = createTestTranslationBatchManager({
				github,
				translator,
				languageDetector,
			});
			const file = createTranslationFileFixture({
				path: "src/content/reference/react/out-of-sync.md",
				filename: "out-of-sync.md",
			});

			await manager.processBatches([file], 1);

			expect(translator.translateContent).toHaveBeenCalled();
			expect(github.refreshTranslationBranchPreservePr).toHaveBeenCalled();
			expect(github.closePullRequest).not.toHaveBeenCalled();
		});

		test("stops batch processing and propagates when consecutive failures reach the circuit breaker threshold", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const languageDetector = createMockLanguageDetectorService();

			github.findPullRequestByBranch.mockResolvedValue(undefined);
			github.getBranch.mockResolvedValue(undefined);
			languageDetector.analyzeLanguage.mockResolvedValue(createUntranslatedLanguageAnalysis());
			translator.translateContent.mockRejectedValue(
				new ApplicationError("Translation failed", ErrorCode.TranslationFailed, "test"),
			);

			const manager = createTestTranslationBatchManager({
				github,
				translator,
				languageDetector,
			});
			const files = Array.from({ length: MAX_CONSECUTIVE_FAILURES + 3 }, (_, index) =>
				createTranslationFileFixture({
					path: `src/content/pages/file-${index}.md`,
					filename: `file-${index}.md`,
				}),
			);

			try {
				await manager.processBatches(files, files.length);
				expect.unreachable("Expected circuit breaker to halt batch processing");
			} catch (error) {
				expect(isCircuitBreakerError(error)).toBe(true);
			}

			expect(translator.translateContent).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILURES);
		});

		test("preserves approved pull request when resetting an existing translation branch", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const languageDetector = createMockLanguageDetectorService();
			const existingPR = createMockPullRequestListItem(1182);

			github.findPullRequestByBranch.mockResolvedValue(existingPR);
			github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
			github.getForkFileContentAtBranch.mockResolvedValue(
				"This is still English prose long enough for language detection to run reliably.",
			);
			github.listPullRequestReviews.mockResolvedValue([
				createMockPullRequestReviewSnapshot({
					id: 99,
					state: "APPROVED",
					body: "Looks good.",
				}),
			]);
			github.getBranch.mockResolvedValue(createGitBranchRefResponse());
			languageDetector.analyzeLanguage.mockResolvedValue(createUntranslatedLanguageAnalysis());

			const manager = createTestTranslationBatchManager({
				github,
				translator,
				languageDetector,
			});
			const file = createTranslationFileFixture({
				path: "src/content/blog/2024/04/25/react-19-upgrade-guide.md",
				filename: "react-19-upgrade-guide.md",
			});

			await manager.processBatches([file], 1);

			expect(translator.translateContent).toHaveBeenCalled();
			expect(github.refreshTranslationBranchPreservePr).toHaveBeenCalled();
			expect(github.closePullRequest).not.toHaveBeenCalled();
		});
	});
});
