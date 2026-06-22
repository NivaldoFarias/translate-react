import { describe, expect, test } from "bun:test";

import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationBatchManager } from "@/app/services/runner/workflow/translation-batch.manager";

import {
	createGitBranchRefResponse,
	createMockPullRequestListItem,
	createMockPullRequestReviewCommentSnapshot,
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

		test("runs full re-translation when a CHANGES_REQUESTED review follows the runner commit", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const languageDetector = createMockLanguageDetectorService();
			const existingPR = createMockPullRequestListItem(1227);
			const diffComment = `\
\`\`\`diff
-## Solução de problemas {/*troubleshooting*/}
+## Solução de Problemas {/*troubleshooting*/}
\`\`\``;
			const forkContent = "## Solução de problemas {/*troubleshooting*/}\n\nCorpo em português.";

			github.findPullRequestByBranch.mockResolvedValue(existingPR);
			github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
			github.getForkFileContentAtBranch.mockResolvedValue(forkContent);
			github.getLatestTranslationCommit.mockResolvedValue({
				timestamp: new Date("2026-06-03T10:00:00Z"),
				message: "docs: translate `target.md` to Brazilian Portuguese",
			});
			github.getLatestTranslationCommitTimestamp.mockResolvedValue(
				new Date("2026-06-03T10:00:00Z"),
			);
			github.listPullRequestReviews.mockResolvedValue([
				createMockPullRequestReviewSnapshot({ body: diffComment }),
			]);
			github.getBranch.mockResolvedValue(createGitBranchRefResponse());
			languageDetector.analyzeLanguage.mockResolvedValue(createTranslatedLanguageAnalysis());

			const manager = createTestTranslationBatchManager({
				github,
				translator,
				languageDetector,
			});
			const file = createTranslationFileFixture({
				path: "src/content/reference/react/target.md",
				filename: "target.md",
				content: "## Troubleshooting\n\nEnglish body.",
			});

			const results = await manager.processBatches([file], 1);

			expect(translator.translateContent).toHaveBeenCalledWith(file, {
				maintainerFeedbackComments: [diffComment],
			});
			expect(github.commitTranslation).toHaveBeenCalledWith(
				expect.objectContaining({
					message: "docs: translate `target.md` to Brazilian Portuguese\n\nper @jhonmike feedback",
				}),
			);
			expect(github.createPullRequest).not.toHaveBeenCalled();
			expect(github.updatePullRequestBody).toHaveBeenCalledWith(
				existingPR.number,
				expect.stringMatching(/requer revisão humana[\s\S]*\[!TIP\]/),
			);
			expect(github.createCommentOnPullRequest).toHaveBeenCalledWith(
				existingPR.number,
				expect.stringContaining("CHANGES_REQUESTED"),
			);
			expect(results.get(file.filename)?.pullRequest).toEqual(existingPR);
		});

		test("passes inline review comments into remediation when the review summary is empty", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const languageDetector = createMockLanguageDetectorService();
			const existingPR = createMockPullRequestListItem(1227);
			const inlineComment = "Use sentence case in this heading.";
			const forkContent = "## Solução de problemas {/*troubleshooting*/}\n\nCorpo em português.";

			github.findPullRequestByBranch.mockResolvedValue(existingPR);
			github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
			github.getForkFileContentAtBranch.mockResolvedValue(forkContent);
			github.getLatestTranslationCommit.mockResolvedValue({
				timestamp: new Date("2026-06-03T10:00:00Z"),
				message: "docs: translate `target.md` to Brazilian Portuguese",
			});
			github.getLatestTranslationCommitTimestamp.mockResolvedValue(
				new Date("2026-06-03T10:00:00Z"),
			);
			github.listPullRequestReviews.mockResolvedValue([
				createMockPullRequestReviewSnapshot({ body: null }),
			]);
			github.listPullRequestReviewComments.mockResolvedValue([
				createMockPullRequestReviewCommentSnapshot({ body: inlineComment }),
			]);
			github.getBranch.mockResolvedValue(createGitBranchRefResponse());
			languageDetector.analyzeLanguage.mockResolvedValue(createTranslatedLanguageAnalysis());

			const manager = createTestTranslationBatchManager({
				github,
				translator,
				languageDetector,
			});
			const file = createTranslationFileFixture({
				path: "src/content/reference/react/target.md",
				filename: "target.md",
				content: "## Troubleshooting\n\nEnglish body.",
			});

			await manager.processBatches([file], 1);

			expect(translator.translateContent).toHaveBeenCalledWith(file, {
				maintainerFeedbackComments: [inlineComment],
			});
		});

		test("loads maintainer feedback before branch refresh clears translation commits", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const languageDetector = createMockLanguageDetectorService();
			const existingPR = createMockPullRequestListItem(1227);
			const diffComment = "Please fix the heading.";
			const runnerCommitAt = new Date("2026-06-03T10:00:00Z");
			const forkContent = "## Solução de problemas {/*troubleshooting*/}\n\nCorpo em português.";

			github.findPullRequestByBranch.mockResolvedValue(existingPR);
			github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
			github.getForkFileContentAtBranch.mockResolvedValue(forkContent);
			github.getLatestTranslationCommit.mockResolvedValue({
				timestamp: runnerCommitAt,
				message: "docs: translate `target.md` to Brazilian Portuguese",
			});
			github.getLatestTranslationCommitTimestamp.mockImplementation(() => {
				if (github.refreshTranslationBranchPreservePr.mock.calls.length > 0) {
					return Promise.resolve(undefined);
				}

				return Promise.resolve(runnerCommitAt);
			});
			github.listPullRequestReviews.mockResolvedValue([
				createMockPullRequestReviewSnapshot({ body: diffComment }),
			]);
			github.getBranch.mockResolvedValue(createGitBranchRefResponse());
			languageDetector.analyzeLanguage.mockResolvedValue(createTranslatedLanguageAnalysis());

			const manager = createTestTranslationBatchManager({
				github,
				translator,
				languageDetector,
			});
			const file = createTranslationFileFixture({
				path: "src/content/reference/react/target.md",
				filename: "target.md",
				content: "## Troubleshooting\n\nEnglish body.",
			});

			await manager.processBatches([file], 1);

			expect(github.getLatestTranslationCommitTimestamp.mock.invocationCallOrder[0]).toBeLessThan(
				github.refreshTranslationBranchPreservePr.mock.invocationCallOrder[0] ??
					Number.POSITIVE_INFINITY,
			);
			expect(translator.translateContent).toHaveBeenCalledWith(file, {
				maintainerFeedbackComments: [diffComment],
			});
			expect(github.commitTranslation).toHaveBeenCalledWith(
				expect.objectContaining({
					message: "docs: translate `target.md` to Brazilian Portuguese\n\nper @jhonmike feedback",
				}),
			);
		});

		test("reprocesses maintainer feedback while preserving the pull request and refreshing the branch base", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const languageDetector = createMockLanguageDetectorService();
			const existingPR = createMockPullRequestListItem(1208);

			github.findPullRequestByBranch.mockResolvedValue(existingPR);
			github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
			github.getForkFileContentAtBranch.mockResolvedValue(
				"Conteúdo em português suficientemente longo para detecção de idioma.",
			);
			github.getLatestTranslationCommit.mockResolvedValue({
				timestamp: new Date("2026-06-03T10:00:00Z"),
				message: "docs: translate `react-conf-2021-recap.md` to Brazilian Portuguese",
			});
			github.getLatestTranslationCommitTimestamp.mockResolvedValue(
				new Date("2026-06-03T10:00:00Z"),
			);
			github.listPullRequestReviews.mockResolvedValue([
				createMockPullRequestReviewSnapshot({
					body: "Please review the heading case in this file.",
				}),
			]);
			github.getBranch.mockResolvedValue(
				createGitBranchRefResponse({
					ref: "refs/heads/translate/src-content-blog-post",
					sha: "branch-sha-before-fix",
				}),
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

			expect(translator.translateContent).toHaveBeenCalled();
			expect(github.commitTranslation).toHaveBeenCalled();
			expect(github.closePullRequest).not.toHaveBeenCalled();
			expect(github.refreshTranslationBranchPreservePr).toHaveBeenCalled();
			expect(github.createPullRequest).not.toHaveBeenCalled();
			expect(github.updatePullRequestBody).toHaveBeenCalledWith(
				existingPR.number,
				expect.stringMatching(/requer revisão humana[\s\S]*\[!TIP\]/),
			);
			expect(github.createCommentOnPullRequest).toHaveBeenCalledWith(
				existingPR.number,
				expect.stringContaining("CHANGES_REQUESTED"),
			);
			expect(results.get(file.filename)?.pullRequest).toEqual(existingPR);
			expect(results.get(file.filename)?.pullRequestProgress).toBe(
				PullRequestProgressAction.Reused,
			);
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
