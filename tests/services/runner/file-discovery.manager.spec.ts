import { describe, expect, test } from "bun:test";

import type { RunnerServiceDependencies } from "@/app/services/runner/runner.types";

import { localeService } from "@/app/composition";
import { FileDiscoveryManager } from "@/app/services/runner/workflow/file-discovery.manager";

import { createRepositoryTreeItemFixture } from "@tests/fixtures";
import {
	createMockGitHubService,
	createMockLanguageCacheService,
	createMockLanguageDetectorService,
	createMockTranslatorService,
} from "@tests/mocks";

function createTestFileDiscoveryManager(overrides: Partial<RunnerServiceDependencies> = {}) {
	return new FileDiscoveryManager({
		github: overrides.github ?? createMockGitHubService(),
		translator: overrides.translator ?? createMockTranslatorService(),
		languageCache: overrides.languageCache ?? createMockLanguageCacheService(),
		locale: overrides.locale ?? localeService,
		languageDetector: overrides.languageDetector ?? createMockLanguageDetectorService(),
	} as RunnerServiceDependencies);
}

describe("FileDiscoveryManager", () => {
	describe("filterByPRs", () => {
		test("includes file for processing when translation pull request evaluation fails", async () => {
			const github = createMockGitHubService();
			github.findPullRequestByBranch.mockRejectedValue(new Error("GitHub API unavailable"));

			const manager = createTestFileDiscoveryManager({
				github: github as unknown as RunnerServiceDependencies["github"],
			});
			const candidate = createRepositoryTreeItemFixture({ path: "src/content/page.md" });

			const result = await manager.filterByPRs([candidate]);

			expect(result.filesToFetch).toHaveLength(1);
			expect(result.numFilesWithPRs).toBe(0);
		});

		test("skips file when open translation pull request is valid", async () => {
			const github = createMockGitHubService();
			const languageDetector = createMockLanguageDetectorService();

			github.findPullRequestByBranch.mockResolvedValue({ number: 7 } as never);
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

			const manager = createTestFileDiscoveryManager({
				github: github as unknown as RunnerServiceDependencies["github"],
				languageDetector:
					languageDetector as unknown as RunnerServiceDependencies["languageDetector"],
			});
			const candidate = createRepositoryTreeItemFixture({ path: "src/content/page.md" });

			const result = await manager.filterByPRs([candidate]);

			expect(result.filesToFetch).toHaveLength(0);
			expect(result.numFilesWithPRs).toBe(1);
		});
	});
});
