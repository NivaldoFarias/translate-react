import type { LocaleService } from "@/app/services/locale/locale.service";
import type { RunnerServiceDependencies } from "@/app/services/runner/runner.types";

import type {
	MockGitHubService,
	MockLanguageCacheService,
	MockLanguageDetectorService,
	MockTranslatorService,
} from "@tests/mocks";

import { localeService } from "@/app/composition";

import {
	createMockGitHubService,
	createMockLanguageCacheService,
	createMockLanguageDetectorService,
	createMockTranslatorService,
} from "@tests/mocks";

/** Mock dependency overrides accepted by runner workflow unit test harnesses */
export interface MockRunnerServiceDependencies {
	github?: MockGitHubService;
	translator?: MockTranslatorService;
	languageCache?: MockLanguageCacheService;
	locale?: LocaleService;
	languageDetector?: MockLanguageDetectorService;
}

/**
 * Builds {@link RunnerServiceDependencies} from typed mocks with a single production cast.
 *
 * @param overrides Mock services to inject; omitted entries use default factories
 *
 * @returns Dependencies bag for runner workflow managers under test
 */
export function buildRunnerServiceDependencies(
	overrides: MockRunnerServiceDependencies = {},
): RunnerServiceDependencies {
	return {
		github: overrides.github ?? createMockGitHubService(),
		translator: overrides.translator ?? createMockTranslatorService(),
		languageCache: overrides.languageCache ?? createMockLanguageCacheService(),
		locale: overrides.locale ?? localeService,
		languageDetector: overrides.languageDetector ?? createMockLanguageDetectorService(),
	} as unknown as RunnerServiceDependencies;
}
