/**
 * Runs `RunnerService` once with real `translatorService` (live LLM) and mocked GitHub.
 *
 * Use `bun run ci:smoke-llm`, not `bun test` — the test preload replaces `env`.
 *
 * Markdown inputs are every `*.md` file under `tests/fixtures/md/` (sorted by name), loaded via
 * {@link loadIntegrationWorkflowFilesFromMdFixtureDir} (same helper as integration tests).
 * Configure tokens and workflow knobs via the same `.env` / environment as the main app (`GH_TOKEN`,
 * `LLM_API_KEY`, `LLM_MODEL`, etc.).
 *
 * Mocked GitHub outputs (per-fixture folders under `.out/`, plus the translation-progress issue
 * comment at `.out/translation-progress-issue-comment.md`) are written for inspection after each run.
 *
 * @example
 * ```bash
 * bun run ci:smoke-llm
 * ```
 */

import type { LanguageCacheEntry } from "@/app/domain/workflow/";
import type { GitHubService } from "@/app/services/github/";
import type { RunnerServiceDependencies } from "@/app/services/runner/runner.types";

import { languageDetectorService, localeService, translatorService } from "@/app/composition";
import { CacheService } from "@/app/services/cache/";
import { RunnerService } from "@/app/services/runner/runner.service";
import { env, logger, RuntimeEnvironment } from "@/app/utils/";

import {
	createWorkflowGitHubServiceFromFiles,
	INTEGRATION_MD_FIXTURE_DIR_RELATIVE,
	loadIntegrationWorkflowFilesFromMdFixtureDir,
} from "@tests/integration/create-integration-runner";

const log = logger.child({ component: "workflow-smoke-llm" });

/** Relative root directory where this script persists mocked GitHub artifacts */
const SMOKE_GITHUB_ARTIFACT_DIR = ".out" as const;

async function main() {
	if (env.NODE_ENV === RuntimeEnvironment.Test) {
		log.error("Use bun run ci:smoke-llm (bun test mocks env)");
		process.exit(1);
	}

	try {
		log.debug("Loading integration markdown fixtures");

		const integrationFiles = await loadIntegrationWorkflowFilesFromMdFixtureDir();
		const totalBytes = integrationFiles.reduce((sum, file) => sum + file.content.length, 0);

		log.debug(
			{
				fixtureDir: INTEGRATION_MD_FIXTURE_DIR_RELATIVE,
				fileCount: integrationFiles.length,
				markdownBytes: totalBytes,
			},
			"Integration fixtures loaded",
		);

		log.debug(
			{ mockGithubArtifactsDir: SMOKE_GITHUB_ARTIFACT_DIR },
			"Creating mocked GitHub service",
		);

		const github = createWorkflowGitHubServiceFromFiles(integrationFiles, {
			captureArtifactsDir: SMOKE_GITHUB_ARTIFACT_DIR,
		});

		const runner = new RunnerService(
			{
				github: github as unknown as GitHubService,
				translator: translatorService,
				languageCache: new CacheService<LanguageCacheEntry>(),
				locale: localeService,
				languageDetector: languageDetectorService,
			} as RunnerServiceDependencies,
			{ batchSize: 1 },
		);

		log.info(
			{
				model: env.LLM_MODEL,
				files: integrationFiles.map((file) => file.repoPath),
			},
			"LLM workflow smoke started",
		);

		log.debug("Running translation workflow against fixtures");

		const stats = await runner.run();

		log.info({ stats }, "LLM workflow smoke finished");
		process.exit(0);
	} catch (error) {
		log.error({ error }, "LLM workflow smoke failed");
		process.exit(1);
	}
}

await main();
