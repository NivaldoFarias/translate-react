import { describe, expect, test } from "bun:test";

import type { GitHubService } from "@/app/services/github/github.service";
import type { PatchedRepositoryTreeItem } from "@/app/services/github/types";
import type { RunnerServiceDependencies } from "@/app/services/runner/runner.types";
import type { RunLimits } from "@/app/services/runner/workflow/run-limits.util";
import type { TranslatorService } from "@/app/services/translator/translator.service";

import { localeService } from "@/app/composition";
import { RunnerService } from "@/app/services/runner/runner.service";
import { ApplicationError } from "@/shared/errors/";

import { createRepositoryTreeItemFixture } from "@tests/fixtures";
import { useTranslationTargetPaths } from "@tests/helpers/translation-target.harness";
import {
	createMockGitHubService,
	createMockLanguageCacheService,
	createMockLanguageDetectorService,
	createMockTranslatorService,
} from "@tests/mocks";

function createTestRunnerService(
	overrides: Partial<RunnerServiceDependencies> = {},
	runLimits?: RunLimits,
): RunnerService {
	return new RunnerService(
		{
			github: overrides.github ?? createMockGitHubService(),
			translator: overrides.translator ?? createMockTranslatorService(),
			languageCache: overrides.languageCache ?? createMockLanguageCacheService(),
			locale: overrides.locale ?? localeService,
			languageDetector: overrides.languageDetector ?? createMockLanguageDetectorService(),
		} as RunnerServiceDependencies,
		{ batchSize: 1, ...(runLimits ? { runLimits } : {}) },
	);
}

const QUEUED_PATHS = [
	"src/content/learn/index.md",
	"src/content/learn/state.md",
	"src/content/reference/react/useState.md",
	"src/content/reference/react/useEffect.md",
	"src/content/blog/2025/10/01/react-19-2.md",
];

/** Mock GitHub service whose upstream tree queues {@link QUEUED_PATHS} with no open PRs */
function createGitHubWithQueue(openTranslationPullRequests = 0) {
	const github = createMockGitHubService();
	github.getRepositoryTree.mockResolvedValue(
		QUEUED_PATHS.map((path) => createRepositoryTreeItemFixture({ path, sha: `sha-${path}` })),
	);
	github.getFile.mockImplementation((file) => {
		const { path, sha, filename } = file as PatchedRepositoryTreeItem;

		return Promise.resolve({ content: "# English content", path, sha, filename });
	});
	github.countOpenTranslationPullRequests.mockResolvedValue(openTranslationPullRequests);

	return github;
}

describe("RunnerService", () => {
	describe("run", () => {
		test("returns WorkflowStatistics when workflow completes with one file translated", async () => {
			const runner = createTestRunnerService();

			const stats = await runner.run();

			expect(stats).toBeDefined();
			expect(stats.totalCount).toBe(1);
			expect(stats.successCount).toBe(1);
			expect(stats.failureCount).toBe(0);
			expect(stats.successRate).toBe(1);
		});

		test("throws when verifyLLMConnectivity fails", () => {
			const llmError = new Error("LLM unreachable");
			const translator = createMockTranslatorService();
			translator.testConnectivity.mockRejectedValue(llmError);

			const runner = createTestRunnerService({
				translator: translator as unknown as TranslatorService,
			});

			expect(runner.run()).rejects.toThrow("LLM unreachable");
		});

		test("throws ApplicationError when verifyTokenPermissions returns false", () => {
			const github = createMockGitHubService();
			github.verifyTokenPermissions.mockResolvedValue(false);

			const runner = createTestRunnerService({ github: github as unknown as GitHubService });

			expect(runner.run()).rejects.toThrow(ApplicationError);
		});

		test("completes successfully with empty statistics when repository tree yields no translation work", async () => {
			const github = createMockGitHubService();
			github.getRepositoryTree.mockResolvedValue([]);

			const runner = createTestRunnerService({ github: github as unknown as GitHubService });

			const stats = await runner.run();

			expect(stats.totalCount).toBe(0);
			expect(stats.successCount).toBe(0);
			expect(stats.failureCount).toBe(0);
			expect(stats.successRate).toBe(0);
		});

		test("proceeds without error when fetchTranslationGuidelinesFile returns null", async () => {
			const github = createMockGitHubService();
			github.fetchTranslationGuidelinesFile.mockResolvedValue(null);

			const runner = createTestRunnerService({ github: github as unknown as GitHubService });

			const stats = await runner.run();

			expect(stats).toBeDefined();
			expect(stats.totalCount).toBe(1);
		});
	});

	describe("run limits", () => {
		test("processes every queued file when no run limits are set", async () => {
			const runner = createTestRunnerService({
				github: createGitHubWithQueue() as unknown as GitHubService,
			});

			const stats = await runner.run();

			expect(stats.totalCount).toBe(5);
			expect(stats.filesLeftOverByCap).toBe(0);
			expect(stats.filesHeldByCeiling).toBe(0);
		});

		test("stops at the per-run cap and reports the rest as backlog", async () => {
			const runner = createTestRunnerService(
				{ github: createGitHubWithQueue() as unknown as GitHubService },
				{ maxFilesPerRun: 3, maxOpenTranslationPullRequests: 0 },
			);

			const stats = await runner.run();

			expect(stats.totalCount).toBe(3);
			expect(stats.filesLeftOverByCap).toBe(2);
		});

		test("opens no new PRs once open translation PRs reach the ceiling", async () => {
			const github = createGitHubWithQueue(10);
			const runner = createTestRunnerService(
				{ github: github as unknown as GitHubService },
				{ maxFilesPerRun: 3, maxOpenTranslationPullRequests: 10 },
			);

			const stats = await runner.run();

			expect(stats.totalCount).toBe(0);
			expect(stats.filesHeldByCeiling).toBe(3);
			expect(github.createPullRequest).not.toHaveBeenCalled();
		});

		describe("targeted run", () => {
			useTranslationTargetPaths(QUEUED_PATHS[0] ?? "", QUEUED_PATHS[1] ?? "");

			test("ignores the run limits", async () => {
				const runner = createTestRunnerService(
					{ github: createGitHubWithQueue(10) as unknown as GitHubService },
					{ maxFilesPerRun: 1, maxOpenTranslationPullRequests: 10 },
				);

				const stats = await runner.run();

				expect(stats.totalCount).toBe(2);
				expect(stats.filesHeldByCeiling).toBe(0);
			});
		});
	});
});
