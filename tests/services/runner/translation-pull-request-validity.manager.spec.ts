import { describe, expect, test } from "bun:test";

import { TranslationPullRequestValidityManager } from "@/app/services/runner/workflow/translation-pull-request-validity.manager";

import {
	createMockPullRequestListItem,
	createMockPullRequestReviewSnapshot,
	createPullRequestStatusFixture,
	createTranslatedLanguageAnalysis,
	createUntranslatedLanguageAnalysis,
} from "@tests/fixtures";
import { buildRunnerServiceDependencies } from "@tests/helpers/runner-dependencies.harness";
import { createMockGitHubService, createMockLanguageDetectorService } from "@tests/mocks";

function createValidityManager(
	overrides: Parameters<typeof buildRunnerServiceDependencies>[0] = {},
) {
	return new TranslationPullRequestValidityManager(buildRunnerServiceDependencies(overrides));
}

describe("TranslationPullRequestValidityManager", () => {
	test("returns valid when open PR has translated fork content and is in sync", async () => {
		const github = createMockGitHubService();
		const languageDetector = createMockLanguageDetectorService();

		github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(42));
		github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
		github.getForkFileContentAtBranch.mockResolvedValue(
			"Texto em português com comprimento suficiente para análise linguística confiável.",
		);
		languageDetector.analyzeLanguage.mockResolvedValue(
			createTranslatedLanguageAnalysis({
				ratio: 0.95,
				languageScore: { target: 0.95, source: 0.05 },
			}),
		);

		const manager = createValidityManager({ github, languageDetector });

		const result = await manager.evaluate("src/content/reference/react/legacy.md");

		expect(result.isValid).toBe(true);
		expect(result.pullRequest?.number).toBe(42);
	});

	test("returns out_of_sync when pull request has merge conflicts", async () => {
		const github = createMockGitHubService();

		github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(7));
		github.checkPullRequestStatus.mockResolvedValue(
			createPullRequestStatusFixture({
				hasConflicts: true,
				mergeable: false,
				needsUpdate: true,
				mergeableState: "dirty",
			}),
		);

		const manager = createValidityManager({ github });

		const result = await manager.evaluate("src/content/page.md");

		expect(result.isValid).toBe(false);
		expect(result.invalidReason).toBe("out_of_sync");
	});

	test("returns not_translated when fork branch content is not target language", async () => {
		const github = createMockGitHubService();
		const languageDetector = createMockLanguageDetectorService();

		github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(9));
		github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
		github.getForkFileContentAtBranch.mockResolvedValue(
			"This is still English prose long enough for language detection to run reliably.",
		);
		languageDetector.analyzeLanguage.mockResolvedValue(createUntranslatedLanguageAnalysis());

		const manager = createValidityManager({ github, languageDetector });

		const result = await manager.evaluate("src/content/page.md");

		expect(result.isValid).toBe(false);
		expect(result.invalidReason).toBe("not_translated");
	});

	test("returns needs_maintainer_fix when a CHANGES_REQUESTED review follows the latest runner commit", async () => {
		const github = createMockGitHubService();
		const languageDetector = createMockLanguageDetectorService();

		github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(55));
		github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
		github.getForkFileContentAtBranch.mockResolvedValue(
			"Texto em português com comprimento suficiente para análise linguística confiável.",
		);
		github.getLatestTranslationCommit.mockResolvedValue({
			timestamp: new Date("2026-06-03T10:00:00Z"),
			message: "docs: translate `legacy.md` to Português (Brasil)",
		});
		github.getLatestTranslationCommitTimestamp.mockResolvedValue(new Date("2026-06-03T10:00:00Z"));
		github.listPullRequestReviews.mockResolvedValue([
			createMockPullRequestReviewSnapshot({ body: "Please fix the heading." }),
		]);
		languageDetector.analyzeLanguage.mockResolvedValue(
			createTranslatedLanguageAnalysis({
				ratio: 0.95,
				languageScore: { target: 0.95, source: 0.05 },
			}),
		);

		const manager = createValidityManager({ github, languageDetector });

		const result = await manager.evaluate("src/content/reference/react/legacy.md");

		expect(result.isValid).toBe(false);
		expect(result.invalidReason).toBe("needs_maintainer_fix");
		expect(result.pullRequest?.number).toBe(55);
	});

	test("returns valid when CHANGES_REQUESTED review predates the latest remediation commit", async () => {
		const github = createMockGitHubService();
		const languageDetector = createMockLanguageDetectorService();

		github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(55));
		github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
		github.getForkFileContentAtBranch.mockResolvedValue(
			"Texto em português com comprimento suficiente para análise linguística confiável.",
		);
		github.getLatestTranslationCommit.mockResolvedValue({
			timestamp: new Date("2026-06-04T10:00:00Z"),
			message: "docs: translate `legacy.md` to Português (Brasil)\n\nper @jhonmike feedback",
		});
		github.listPullRequestReviews.mockResolvedValue([
			createMockPullRequestReviewSnapshot({ body: "Please fix the heading." }),
		]);
		languageDetector.analyzeLanguage.mockResolvedValue(
			createTranslatedLanguageAnalysis({
				ratio: 0.95,
				languageScore: { target: 0.95, source: 0.05 },
			}),
		);

		const manager = createValidityManager({ github, languageDetector });

		const result = await manager.evaluate("src/content/reference/react/legacy.md");

		expect(result.isValid).toBe(true);
		expect(result.pullRequest?.number).toBe(55);
	});

	test("returns needs_maintainer_fix when CHANGES_REQUESTED review follows the latest remediation commit", async () => {
		const github = createMockGitHubService();
		const languageDetector = createMockLanguageDetectorService();

		github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(55));
		github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
		github.getForkFileContentAtBranch.mockResolvedValue(
			"Texto em português com comprimento suficiente para análise linguística confiável.",
		);
		github.getLatestTranslationCommit.mockResolvedValue({
			timestamp: new Date("2026-06-04T10:00:00Z"),
			message: "docs: translate `legacy.md` to Português (Brasil)\n\nper @jhonmike feedback",
		});
		github.listPullRequestReviews.mockResolvedValue([
			createMockPullRequestReviewSnapshot({
				submittedAt: new Date("2026-06-04T12:00:00Z"),
				body: "Please fix the heading again.",
			}),
		]);
		languageDetector.analyzeLanguage.mockResolvedValue(
			createTranslatedLanguageAnalysis({
				ratio: 0.95,
				languageScore: { target: 0.95, source: 0.05 },
			}),
		);

		const manager = createValidityManager({ github, languageDetector });

		const result = await manager.evaluate("src/content/reference/react/legacy.md");

		expect(result.isValid).toBe(false);
		expect(result.invalidReason).toBe("needs_maintainer_fix");
		expect(result.pullRequest?.number).toBe(55);
	});
});
