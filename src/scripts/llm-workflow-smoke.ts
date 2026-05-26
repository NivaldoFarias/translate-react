/**
 * Runs `RunnerService` once with real `translatorService` (live LLM) and mocked GitHub.
 *
 * Use `bun run smoke:llm-workflow`, not `bun test` — the test preload replaces `env`.
 *
 * Markdown inputs are every `*.md` file under `tests/fixtures/md/` (sorted by name), loaded via
 * {@link loadIntegrationWorkflowFilesFromMdFixtureDir} (same helper as integration tests).
 * Configure tokens and workflow knobs via the same `.env` / environment as the main app (`GH_TOKEN`,
 * `LLM_API_KEY`, `LLM_MODEL`, etc.).
 *
 * Mocked GitHub outputs (per-fixture folders under `.out/`, plus the translation-progress issue
 * comment at `.out/translation-progress-issue-comment.md`) are written for inspection after each run.
 */

import type { LanguageCacheEntry } from "@/domain/workflow/";
import type { GitHubService } from "@/services/github/";
import type { RunnerServiceDependencies } from "@/services/runner/runner.types";

import { languageDetectorService, localeService, translatorService } from "@/composition";
import { CacheService } from "@/services/cache/";
import { RunnerService } from "@/services/runner/runner.service";
import { env, logger, RuntimeEnvironment } from "@/utils/";

import {
	createWorkflowGitHubServiceFromFiles,
	INTEGRATION_MD_FIXTURE_DIR_RELATIVE,
	loadIntegrationWorkflowFilesFromMdFixtureDir,
} from "@tests/integration/create-integration-runner";

const log = logger.child({ component: "llm-workflow-smoke" });

/** Relative root directory where this script persists mocked GitHub artifacts */
const SMOKE_GITHUB_ARTIFACT_DIR = ".out" as const;

async function main() {
	if (env.NODE_ENV === RuntimeEnvironment.Test) {
		log.error("Use bun run smoke:llm-workflow (bun test mocks env)");
		process.exit(1);
	}

	try {
		const integrationFiles = await loadIntegrationWorkflowFilesFromMdFixtureDir();
		const github = createWorkflowGitHubServiceFromFiles(integrationFiles, {
			captureArtifactsDir: SMOKE_GITHUB_ARTIFACT_DIR,
		});
		const totalBytes = integrationFiles.reduce((sum, f) => sum + f.content.length, 0);

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
				fixtureDir: INTEGRATION_MD_FIXTURE_DIR_RELATIVE,
				fileCount: integrationFiles.length,
				markdownBytes: totalBytes,
				files: integrationFiles.map((f) => f.repoPath),
				mockGithubArtifactsDir: SMOKE_GITHUB_ARTIFACT_DIR,
			},
			"LLM workflow smoke started",
		);

		const stats = await runner.run();

		log.info({ stats }, "LLM workflow smoke finished");
		process.exit(0);
	} catch (error) {
		log.error({ error }, "LLM workflow smoke failed");
		process.exit(1);
	}
}

await main();
