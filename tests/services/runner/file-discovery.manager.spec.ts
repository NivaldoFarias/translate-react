import { describe, expect, test } from "bun:test";

import { FAIL_OPEN_REASONS } from "@/app/constants/fail-open.constants";
import { FileDiscoveryManager } from "@/app/services/runner/workflow/file-discovery.manager";

import {
	createMockPullRequestListItem,
	createPullRequestStatusFixture,
	createRepositoryTreeItemFixture,
	createTranslatedLanguageAnalysis,
} from "@tests/fixtures";
import { buildRunnerServiceDependencies } from "@tests/helpers/runner-dependencies.harness";
import { createMockGitHubService, createMockLanguageDetectorService } from "@tests/mocks";

function createTestFileDiscoveryManager(
	overrides: Parameters<typeof buildRunnerServiceDependencies>[0] = {},
) {
	return new FileDiscoveryManager(buildRunnerServiceDependencies(overrides));
}

describe("FileDiscoveryManager", () => {
	describe("filterByPRs", () => {
		test("includes file for processing when translation pull request evaluation fails", async () => {
			const github = createMockGitHubService();
			github.findPullRequestByBranch.mockRejectedValue(new Error("GitHub API unavailable"));

			const manager = createTestFileDiscoveryManager({ github });
			const candidate = createRepositoryTreeItemFixture({ path: "src/content/page.md" });

			const result = await manager.filterByPRs([candidate]);

			expect(result.filesToFetch).toHaveLength(1);
			expect(result.numFilesWithPRs).toBe(0);
		});

		test("increments PR validity fail-open counter when evaluation fails", async () => {
			const github = createMockGitHubService();
			github.findPullRequestByBranch.mockRejectedValue(new Error("GitHub API unavailable"));

			const manager = createTestFileDiscoveryManager({ github });
			const candidate = createRepositoryTreeItemFixture({ path: "src/content/page.md" });
			const failOpenInventory = {
				[FAIL_OPEN_REASONS.prValidityEvaluationError]: 0,
				[FAIL_OPEN_REASONS.languageDetectionEmptyContent]: 0,
				[FAIL_OPEN_REASONS.languageDetectionShortContent]: 0,
				[FAIL_OPEN_REASONS.languageDetectionCldError]: 0,
			};

			await manager.filterByPRs([candidate], failOpenInventory);

			expect(failOpenInventory[FAIL_OPEN_REASONS.prValidityEvaluationError]).toBe(1);
		});

		test("skips file when open translation pull request is valid", async () => {
			const github = createMockGitHubService();
			const languageDetector = createMockLanguageDetectorService();

			github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(7));
			github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
			github.getForkFileContentAtBranch.mockResolvedValue(
				"Conteúdo em português suficientemente longo para detecção de idioma.",
			);
			languageDetector.analyzeLanguage.mockResolvedValue(createTranslatedLanguageAnalysis());

			const manager = createTestFileDiscoveryManager({ github, languageDetector });
			const candidate = createRepositoryTreeItemFixture({ path: "src/content/page.md" });

			const result = await manager.filterByPRs([candidate]);

			expect(result.filesToFetch).toHaveLength(0);
			expect(result.numFilesWithPRs).toBe(1);
		});
	});
});
