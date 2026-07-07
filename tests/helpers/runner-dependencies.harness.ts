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
	/** Mock GitHub service injected into the runner */
	github?: MockGitHubService;

	/** Mock translator service injected into the runner */
	translator?: MockTranslatorService;

	/** Mock language cache service injected into the runner */
	languageCache?: MockLanguageCacheService;

	/** Locale service injected into the runner */
	locale?: LocaleService;

	/** Mock language detector service injected into the runner */
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
