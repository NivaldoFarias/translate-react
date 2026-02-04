import { describe, expect, test } from "bun:test";

import type { GitHubService, TranslatorService } from "@/services/";
import type { RunnerServiceDependencies } from "@/services/runner/runner.types";

import { ApplicationError } from "@/errors/";
import { localeService } from "@/services/";
import { RunnerService } from "@/services/runner/runner.service";

import {
	createMockGitHubService,
	createMockLanguageCacheService,
	createMockLanguageDetectorService,
	createMockTranslatorService,
} from "@tests/mocks";

function createTestRunnerService(
	overrides: Partial<RunnerServiceDependencies> = {},
): RunnerService {
	return new RunnerService(
		{
			github: overrides.github ?? createMockGitHubService(),
			translator: overrides.translator ?? createMockTranslatorService(),
			languageCache: overrides.languageCache ?? createMockLanguageCacheService(),
			locale: overrides.locale ?? localeService,
			languageDetector: overrides.languageDetector ?? createMockLanguageDetectorService(),
		} as RunnerServiceDependencies,
		{ batchSize: 1 },
	);
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

		test("throws ApplicationError with NoFilesToTranslate when repository tree is empty", () => {
			const github = createMockGitHubService();
			github.getRepositoryTree.mockResolvedValue([]);

			const runner = createTestRunnerService({ github: github as unknown as GitHubService });

			expect(runner.run()).rejects.toThrow("Found no files to translate");
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
});
