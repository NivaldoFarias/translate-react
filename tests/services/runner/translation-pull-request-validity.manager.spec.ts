import { describe, expect, test } from "bun:test";

import type { RunnerServiceDependencies } from "@/app/services/runner/runner.types";

import { localeService } from "@/app/composition";
import { TranslationPullRequestValidityManager } from "@/app/services/runner/workflow/translation-pull-request-validity.manager";

import { createMockPullRequestListItem } from "@tests/fixtures";
import {
	createMockGitHubService,
	createMockLanguageCacheService,
	createMockLanguageDetectorService,
	createMockTranslatorService,
} from "@tests/mocks";

function createValidityManager(overrides: Partial<RunnerServiceDependencies> = {}) {
	return new TranslationPullRequestValidityManager({
		github: overrides.github ?? createMockGitHubService(),
		translator: overrides.translator ?? createMockTranslatorService(),
		languageCache: overrides.languageCache ?? createMockLanguageCacheService(),
		locale: overrides.locale ?? localeService,
		languageDetector: overrides.languageDetector ?? createMockLanguageDetectorService(),
	} as RunnerServiceDependencies);
}

describe("TranslationPullRequestValidityManager", () => {
	test("returns valid when open PR has translated fork content and is in sync", async () => {
		const github = createMockGitHubService();
		const languageDetector = createMockLanguageDetectorService();

		github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(42));
		github.checkPullRequestStatus.mockResolvedValue({
			hasConflicts: false,
			mergeable: true,
			needsUpdate: false,
			mergeableState: "clean",
			createdBy: "translate-react-bot",
		});
		github.getForkFileContentAtBranch.mockResolvedValue(
			"Texto em português com comprimento suficiente para análise linguística confiável.",
		);
		languageDetector.analyzeLanguage.mockResolvedValue({
			isTranslated: true,
			ratio: 0.95,
			detectedLanguage: "pt",
			languageScore: { target: 0.95, source: 0.05 },
			rawResult: { reliable: true, languages: [], textBytes: 100, chunks: [] },
		} as never);

		const manager = createValidityManager({
			github: github as unknown as RunnerServiceDependencies["github"],
			languageDetector:
				languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
		});

		const result = await manager.evaluate("src/content/reference/react/legacy.md");

		expect(result.isValid).toBe(true);
		expect(result.pullRequest?.number).toBe(42);
	});

	test("returns out_of_sync when pull request has merge conflicts", async () => {
		const github = createMockGitHubService();

		github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(7));
		github.checkPullRequestStatus.mockResolvedValue({
			hasConflicts: true,
			mergeable: false,
			needsUpdate: true,
			mergeableState: "dirty",
			createdBy: "translate-react-bot",
		} as never);

		const manager = createValidityManager({
			github: github as unknown as RunnerServiceDependencies["github"],
		});

		const result = await manager.evaluate("src/content/page.md");

		expect(result.isValid).toBe(false);
		expect(result.invalidReason).toBe("out_of_sync");
	});

	test("returns not_translated when fork branch content is not target language", async () => {
		const github = createMockGitHubService();
		const languageDetector = createMockLanguageDetectorService();

		github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(9));
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
		languageDetector.analyzeLanguage.mockResolvedValue({
			isTranslated: false,
			ratio: 0.1,
			detectedLanguage: "en",
			languageScore: { target: 0.1, source: 0.9 },
			rawResult: { reliable: true, languages: [], textBytes: 100, chunks: [] },
		} as never);

		const manager = createValidityManager({
			github: github as unknown as RunnerServiceDependencies["github"],
			languageDetector:
				languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
		});

		const result = await manager.evaluate("src/content/page.md");

		expect(result.isValid).toBe(false);
		expect(result.invalidReason).toBe("not_translated");
	});
});
