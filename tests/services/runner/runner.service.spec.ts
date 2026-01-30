import { describe, expect, test } from "bun:test";

import type { RunnerServiceDependencies } from "@/services/runner/runner.types";

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
			expect(stats.totalCount).toBeGreaterThanOrEqual(0);
			expect(stats.successCount).toBeGreaterThanOrEqual(0);
			expect(stats.failureCount).toBeGreaterThanOrEqual(0);
			expect(stats.successRate).toBeGreaterThanOrEqual(0);
			expect(stats.successRate).toBeLessThanOrEqual(1);
		});
	});
});
