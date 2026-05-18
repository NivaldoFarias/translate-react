import { describe, expect, test } from "bun:test";

import type { RunnerServiceDependencies } from "@/services/runner/runner.types";

import { FileDiscoveryManager } from "@/services/runner/managers/file-discovery.manager";
import { localeService } from "@/services/";

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
		test("propagates error when pull request files cannot be fetched", () => {
			const github = createMockGitHubService();
			github.listOpenPullRequests.mockResolvedValue([{ number: 42 }] as never);
			github.getPullRequestFiles.mockRejectedValue(new Error("GitHub API unavailable"));

			const manager = createTestFileDiscoveryManager({
				github: github as unknown as RunnerServiceDependencies["github"],
			});
			const candidate = createRepositoryTreeItemFixture({ path: "src/content/page.md" });

			expect(manager.filterByPRs([candidate])).rejects.toThrow("GitHub API unavailable");
		});

		test("skips file when open pull request is mergeable", async () => {
			const github = createMockGitHubService();
			github.listOpenPullRequests.mockResolvedValue([{ number: 7 }] as never);
			github.getPullRequestFiles.mockResolvedValue(["src/content/page.md"]);
			github.checkPullRequestStatus.mockResolvedValue({
				hasConflicts: false,
				mergeable: true,
				needsUpdate: false,
				mergeableState: "clean",
				createdBy: "translate-react-bot",
			});

			const manager = createTestFileDiscoveryManager({
				github: github as unknown as RunnerServiceDependencies["github"],
			});
			const candidate = createRepositoryTreeItemFixture({ path: "src/content/page.md" });

			const result = await manager.filterByPRs([candidate]);

			expect(result.filesToFetch).toHaveLength(0);
			expect(result.numFilesWithPRs).toBe(1);
		});
	});
});
