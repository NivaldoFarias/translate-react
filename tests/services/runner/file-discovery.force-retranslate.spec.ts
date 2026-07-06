import { describe, expect, mock, test } from "bun:test";

import type { PatchedRepositoryTreeItem } from "@/app/services/github/types";

import { FileDiscoveryManager } from "@/app/services/runner/workflow/file-discovery.manager";

import {
	createMockPullRequestListItem,
	createPullRequestStatusFixture,
	createRepositoryTreeItemFixture,
	createTranslatedLanguageAnalysis,
	createUntranslatedLanguageAnalysis,
} from "@tests/fixtures";
import { buildRunnerServiceDependencies } from "@tests/helpers/runner-dependencies.harness";
import { useTranslationTargetPaths } from "@tests/helpers/translation-target.harness";
import { createMockGitHubService, createMockLanguageDetectorService } from "@tests/mocks";

const TARGET_PATH = "src/content/reference/rsc/use-client.md";
const OTHER_PATH = "src/content/blog/post.md";

function createTestFileDiscoveryManager(
	overrides: Parameters<typeof buildRunnerServiceDependencies>[0] = {},
) {
	return new FileDiscoveryManager(buildRunnerServiceDependencies(overrides));
}

describe("FileDiscoveryManager targeted re-translation", () => {
	useTranslationTargetPaths(TARGET_PATH);

	describe("filterByPRs", () => {
		test("includes a valid pull request file when it is a configured force-retranslate target", async () => {
			const github = createMockGitHubService();
			const languageDetector = createMockLanguageDetectorService();

			github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(1173));
			github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
			github.getForkFileContentAtBranch.mockResolvedValue(
				"Достаточно длинный русский текст для детекции языка.",
			);
			languageDetector.analyzeLanguage.mockResolvedValue(createTranslatedLanguageAnalysis());

			const manager = createTestFileDiscoveryManager({ github, languageDetector });
			const candidate = createRepositoryTreeItemFixture({ path: TARGET_PATH });

			const result = await manager.filterByPRs([candidate]);

			expect(result.filesToFetch).toHaveLength(1);
			expect(result.numFilesWithPRs).toBe(0);
		});

		test("still skips non-target files that have valid open pull requests", async () => {
			const github = createMockGitHubService();
			const languageDetector = createMockLanguageDetectorService();

			github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(7));
			github.checkPullRequestStatus.mockResolvedValue(createPullRequestStatusFixture());
			github.getForkFileContentAtBranch.mockResolvedValue(
				"Conteúdo em português suficientemente longo para detecção de idioma.",
			);
			languageDetector.analyzeLanguage.mockResolvedValue(createTranslatedLanguageAnalysis());

			const manager = createTestFileDiscoveryManager({ github, languageDetector });
			const candidate = createRepositoryTreeItemFixture({ path: OTHER_PATH });

			const result = await manager.filterByPRs([candidate]);

			expect(result.filesToFetch).toHaveLength(0);
			expect(result.numFilesWithPRs).toBe(1);
		});
	});

	describe("discoverFiles", () => {
		test("limits discovery to configured target paths", async () => {
			const github = createMockGitHubService();
			const languageDetector = createMockLanguageDetectorService();

			github.findPullRequestByBranch.mockResolvedValue(undefined);
			github.getFile.mockImplementation((treeItem: unknown) => {
				const item = treeItem as PatchedRepositoryTreeItem;

				return Promise.resolve({
					path: item.path,
					filename: item.path.split("/").pop() ?? item.path,
					content: "# Title\n\nEnglish body content for translation.",
					sha: item.sha,
				});
			});
			languageDetector.analyzeLanguage.mockResolvedValue(createUntranslatedLanguageAnalysis());

			const manager = createTestFileDiscoveryManager({ github, languageDetector });
			const tree = [
				createRepositoryTreeItemFixture({
					path: TARGET_PATH,
					filename: "use-client.md",
				}),
				createRepositoryTreeItemFixture({
					path: OTHER_PATH,
					filename: "post.md",
				}),
			];

			const result = await manager.discoverFiles(tree);

			expect(result.filesToTranslate).toHaveLength(1);
			expect(result.filesToTranslate[0]?.path).toBe(TARGET_PATH);
		});

		test("returns no files when configured targets are absent from the repository tree", async () => {
			const manager = createTestFileDiscoveryManager();
			const tree = [createRepositoryTreeItemFixture({ path: OTHER_PATH })];

			const result = await manager.discoverFiles(tree);

			expect(result.filesToTranslate).toHaveLength(0);
		});
	});

	describe("checkCache", () => {
		test("bypasses cache hits for configured force-retranslate targets", () => {
			const languageCache = {
				getMany: mock(
					() =>
						new Map([
							[
								"use-client.md:abc123",
								{
									detectedLanguage: "ru",
									confidence: 0.99,
									timestamp: Date.now(),
								},
							],
						]),
				),
			};
			const languageDetector = createMockLanguageDetectorService();
			languageDetector.languages = { target: "ru", source: "en" };

			const manager = createTestFileDiscoveryManager({
				languageCache: languageCache as never,
				languageDetector,
			});
			const files = [
				createRepositoryTreeItemFixture({
					path: TARGET_PATH,
					filename: "use-client.md",
					sha: "abc123",
				}),
			];

			const result = manager.checkCache(files);

			expect(result.candidateFiles).toHaveLength(1);
			expect(result.cacheHits).toBe(0);
		});
	});
});
