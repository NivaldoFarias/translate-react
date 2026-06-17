import { describe, expect, test } from "bun:test";

import type { LanguageAnalysisResult } from "@/app/services/language-detector/language-detector.service";
import type { RunnerServiceDependencies } from "@/app/services/runner/runner.types";

import { localeService } from "@/app/composition";
import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationBatchManager } from "@/app/services/runner/workflow/translation-batch.manager";

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
			github.checkPullRequestStatus.mockResolvedValue({
				hasConflicts: false,
				mergeable: true,
				needsUpdate: false,
				mergeableState: "clean",
				createdBy: "translate-react-bot",
			});
			github.getForkFileContentAtBranch.mockResolvedValue(
				"Conteúdo em português suficientemente longo para detecção de idioma.",
			);
			languageDetector.analyzeLanguage.mockResolvedValue({
				isTranslated: true,
				ratio: 0.9,
				detectedLanguage: "pt",
				languageScore: { target: 0.9, source: 0.1 },
				rawResult: { reliable: true, languages: [], textBytes: 100, chunks: [] },
			} as never);

			const manager = createTestTranslationBatchManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				translator: translator as unknown as RunnerServiceDependencies["translator"],
				languageDetector:
					languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
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
			github.getBranch.mockResolvedValue(undefined as never);
			languageDetector.analyzeLanguage.mockResolvedValue({
				isTranslated: false,
				ratio: 0,
				detectedLanguage: "en",
				languageScore: { target: 0, source: 1 },
				rawResult: { reliable: true, languages: [], textBytes: 100, chunks: [] },
			} satisfies LanguageAnalysisResult);

			const manager = createTestTranslationBatchManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				translator: translator as unknown as RunnerServiceDependencies["translator"],
				languageDetector:
					languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
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
			github.checkPullRequestStatus.mockResolvedValue({
				hasConflicts: false,
				mergeable: true,
				needsUpdate: false,
				mergeableState: "clean",
				createdBy: "translate-react-bot",
			});
			github.getForkFileContentAtBranch.mockResolvedValue(forkContent);
			github.getLatestTranslationCommit.mockResolvedValue({
				timestamp: new Date("2026-06-03T10:00:00Z"),
				message: "docs: translate `target.md` to Brazilian Portuguese",
			} as never);
			github.getLatestTranslationCommitTimestamp.mockResolvedValue(
				new Date("2026-06-03T10:00:00Z") as never,
			);
			github.listPullRequestReviews.mockResolvedValue([
				{
					id: 42,
					login: "jhonmike",
					authorAssociation: "MEMBER",
					userType: "User",
					state: "CHANGES_REQUESTED",
					submittedAt: new Date("2026-06-03T12:00:00Z"),
					body: diffComment,
				},
			] as never);
			github.getBranch.mockResolvedValue({
				data: { ref: "refs/heads/translate/test", object: { sha: "branch-sha" } },
			} as never);
			languageDetector.analyzeLanguage.mockResolvedValue({
				isTranslated: true,
				ratio: 0.9,
				detectedLanguage: "pt",
				languageScore: { target: 0.9, source: 0.1 },
				rawResult: { reliable: true, languages: [], textBytes: 100, chunks: [] },
			} as never);

			const manager = createTestTranslationBatchManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				translator: translator as unknown as RunnerServiceDependencies["translator"],
				languageDetector:
					languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
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
			github.checkPullRequestStatus.mockResolvedValue({
				hasConflicts: false,
				mergeable: true,
				needsUpdate: false,
				mergeableState: "clean",
				createdBy: "translate-react-bot",
			});
			github.getForkFileContentAtBranch.mockResolvedValue(forkContent);
			github.getLatestTranslationCommit.mockResolvedValue({
				timestamp: new Date("2026-06-03T10:00:00Z"),
				message: "docs: translate `target.md` to Brazilian Portuguese",
			} as never);
			github.getLatestTranslationCommitTimestamp.mockResolvedValue(
				new Date("2026-06-03T10:00:00Z") as never,
			);
			github.listPullRequestReviews.mockResolvedValue([
				{
					id: 42,
					login: "jhonmike",
					authorAssociation: "MEMBER",
					userType: "User",
					state: "CHANGES_REQUESTED",
					submittedAt: new Date("2026-06-03T12:00:00Z"),
					body: null,
				},
			] as never);
			github.listPullRequestReviewComments.mockResolvedValue([
				{
					login: "jhonmike",
					authorAssociation: "MEMBER",
					userType: "User",
					createdAt: new Date("2026-06-03T12:05:00Z"),
					body: inlineComment,
					pullRequestReviewId: 42,
				},
			] as never);
			github.getBranch.mockResolvedValue({
				data: { ref: "refs/heads/translate/test", object: { sha: "branch-sha" } },
			} as never);
			languageDetector.analyzeLanguage.mockResolvedValue({
				isTranslated: true,
				ratio: 0.9,
				detectedLanguage: "pt",
				languageScore: { target: 0.9, source: 0.1 },
				rawResult: { reliable: true, languages: [], textBytes: 100, chunks: [] },
			} as never);

			const manager = createTestTranslationBatchManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				translator: translator as unknown as RunnerServiceDependencies["translator"],
				languageDetector:
					languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
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

		test("reprocesses maintainer feedback while preserving the pull request and refreshing the branch base", async () => {
			const github = createMockGitHubService();
			const translator = createMockTranslatorService();
			const languageDetector = createMockLanguageDetectorService();
			const existingPR = createMockPullRequestListItem(1208);
			const existingBranchRef = {
				ref: "refs/heads/translate/src-content-blog-post",
				object: { sha: "branch-sha-before-fix" },
			};

			github.findPullRequestByBranch.mockResolvedValue(existingPR);
			github.checkPullRequestStatus.mockResolvedValue({
				hasConflicts: false,
				mergeable: true,
				needsUpdate: false,
				mergeableState: "clean",
				createdBy: "translate-react-bot",
			});
			github.getForkFileContentAtBranch.mockResolvedValue(
				"Conteúdo em português suficientemente longo para detecção de idioma.",
			);
			github.getLatestTranslationCommit.mockResolvedValue({
				timestamp: new Date("2026-06-03T10:00:00Z"),
				message: "docs: translate `react-conf-2021-recap.md` to Brazilian Portuguese",
			} as never);
			github.getLatestTranslationCommitTimestamp.mockResolvedValue(
				new Date("2026-06-03T10:00:00Z") as never,
			);
			github.listPullRequestReviews.mockResolvedValue([
				{
					id: 42,
					login: "jhonmike",
					authorAssociation: "MEMBER",
					userType: "User",
					state: "CHANGES_REQUESTED",
					submittedAt: new Date("2026-06-03T12:00:00Z"),
					body: "Please review the heading case in this file.",
				},
			] as never);
			github.getBranch.mockResolvedValue({ data: existingBranchRef });
			languageDetector.analyzeLanguage.mockResolvedValue({
				isTranslated: true,
				ratio: 0.9,
				detectedLanguage: "pt",
				languageScore: { target: 0.9, source: 0.1 },
				rawResult: { reliable: true, languages: [], textBytes: 100, chunks: [] },
			} as never);

			const manager = createTestTranslationBatchManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				translator: translator as unknown as RunnerServiceDependencies["translator"],
				languageDetector:
					languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
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
			github.checkPullRequestStatus.mockResolvedValue({
				hasConflicts: true,
				mergeable: false,
				needsUpdate: true,
				mergeableState: "dirty",
				createdBy: "translate-react-bot",
			} as never);
			github.getForkFileContentAtBranch.mockResolvedValue(
				"Conteúdo em português suficientemente longo para detecção de idioma.",
			);
			github.getBranch.mockResolvedValue({
				data: { ref: "refs/heads/translate/test", object: { sha: "branch-sha" } },
			} as never);
			languageDetector.analyzeLanguage.mockResolvedValue({
				isTranslated: true,
				ratio: 0.9,
				detectedLanguage: "pt",
				languageScore: { target: 0.9, source: 0.1 },
				rawResult: { reliable: true, languages: [], textBytes: 100, chunks: [] },
			} as never);

			const manager = createTestTranslationBatchManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				translator: translator as unknown as RunnerServiceDependencies["translator"],
				languageDetector:
					languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
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
			github.checkPullRequestStatus.mockResolvedValue({
				hasConflicts: false,
				mergeable: true,
				needsUpdate: false,
				mergeableState: "clean",
				createdBy: "translate-react-bot",
			});
			github.getForkFileContentAtBranch.mockResolvedValue(
				"This is still English prose long enough for language detection to run reliably.",
			);
			github.listPullRequestReviews.mockResolvedValue([
				{
					id: 99,
					login: "jhonmike",
					authorAssociation: "MEMBER",
					userType: "User",
					state: "APPROVED",
					submittedAt: new Date("2026-06-03T12:00:00Z"),
					body: "Looks good.",
				},
			] as never);
			github.getBranch.mockResolvedValue({
				data: { ref: "refs/heads/translate/test", object: { sha: "branch-sha" } },
			} as never);
			languageDetector.analyzeLanguage.mockResolvedValue({
				isTranslated: false,
				ratio: 0.1,
				detectedLanguage: "en",
				languageScore: { target: 0.1, source: 0.9 },
				rawResult: { reliable: true, languages: [], textBytes: 100, chunks: [] },
			} as never);

			const manager = createTestTranslationBatchManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				translator: translator as unknown as RunnerServiceDependencies["translator"],
				languageDetector:
					languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
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
