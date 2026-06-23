import fs from "node:fs/promises";
import path from "node:path";

import type { LanguageCacheEntry } from "@/app/services/cache/types";
import type { GitHubService } from "@/app/services/github/";
import type { RunnerServiceDependencies } from "@/app/services/runner/runner.types";
import type { WorkflowStatistics } from "@/app/services/runner/types";

import type { SmokeProfileId } from "./smoke-profiles.util";

import { languageDetectorService, localeService, translatorService } from "@/app/composition";
import { CacheService } from "@/app/services/cache/";
import { RunnerService } from "@/app/services/runner/runner.service";
import { env, RuntimeEnvironment } from "@/app/utils/";
import { createLogger } from "@/shared/utils/create-logger.util";

import {
	createWorkflowGitHubServiceFromFiles,
	loadWorkflowFilesFromMdFixtureDir,
	MD_FIXTURE_DIR,
} from "@tests/integration/create-integration-runner";

import { resolveSmokeFixtureBasenames } from "./smoke-profiles.util";

/** Default directory for mocked GitHub outputs from workflow smoke */
export const WORKFLOW_SMOKE_ARTIFACT_DIR = ".out" as const;

/** Options for {@link runWorkflowSmoke} */
export interface RunWorkflowSmokeOptions {
	/**
	 * {@link SmokeProfileId} fixture set.
	 *
	 * @see {@link resolveSmokeFixtureBasenames}
	 */
	profile: SmokeProfileId;

	/** Comma-separated fixture basenames. Overrides `profile` when non-empty. */
	filesArgument?: string;

	/** Repository root for fixture and artifact paths */
	cwd?: string;

	/** Relative artifact root (defaults to {@link WORKFLOW_SMOKE_ARTIFACT_DIR}) */
	artifactDir?: string;
}

const log = createLogger({ level: "info", logToConsole: true }).child({
	component: "workflow-smoke",
});

/**
 * Removes a previous artifact tree so partial runs cannot leave stale outputs.
 *
 * @param artifactDir Absolute artifact directory
 */
async function clearSmokeArtifactDir(artifactDir: string) {
	await fs.rm(artifactDir, { recursive: true, force: true });
	log.debug({ artifactDir }, "Cleared previous workflow smoke artifacts");
}

/**
 * Runs {@link RunnerService} with real {@link translatorService} and mocked GitHub fixtures.
 *
 * Loads markdown from `tests/fixtures/md/` and writes translated blobs, PR bodies, and progress
 * comments under `artifactDir`.
 *
 * @param options Profile, optional fixture override, and output directory
 *
 * @returns Workflow statistics from the runner
 *
 * @throws {Error} When `NODE_ENV` is `test` or the runner throws
 *
 * @example
 * ```typescript
 * const stats = await runWorkflowSmoke({ profile: "quick" });
 * ```
 */
export async function runWorkflowSmoke(options: RunWorkflowSmokeOptions) {
	if (env.NODE_ENV === RuntimeEnvironment.Test) {
		throw new Error("Workflow smoke must not run under NODE_ENV=test (use bun run ci:smoke)");
	}

	const cwd = options.cwd ?? process.cwd();
	const artifactDirRelative = options.artifactDir ?? WORKFLOW_SMOKE_ARTIFACT_DIR;
	const artifactDir = path.resolve(cwd, artifactDirRelative);
	const basenames = resolveSmokeFixtureBasenames(options.profile, options.filesArgument ?? "");

	await clearSmokeArtifactDir(artifactDir);

	log.debug({ fixtureDir: MD_FIXTURE_DIR, basenames: basenames ?? "all" }, "Loading fixtures");

	const integrationFiles = await loadWorkflowFilesFromMdFixtureDir(basenames, cwd);
	const totalBytes = integrationFiles.reduce((sum, file) => sum + file.blob.content.length, 0);

	log.debug(
		{
			fixtureDir: MD_FIXTURE_DIR,
			fileCount: integrationFiles.length,
			markdownBytes: totalBytes,
		},
		"Workflow smoke fixtures loaded",
	);

	const github = createWorkflowGitHubServiceFromFiles(integrationFiles, {
		captureArtifactsDir: artifactDirRelative,
		cwd,
	});

	const runner = new RunnerService(
		{
			github: github as unknown as GitHubService,
			translator: translatorService,
			languageCache: new CacheService<LanguageCacheEntry>(),
			locale: localeService,
			languageDetector: languageDetectorService,
		} satisfies RunnerServiceDependencies,
		{ batchSize: 1 },
	);

	log.info(
		{
			model: env.LLM_MODEL,
			profile: options.profile,
			artifactDir: artifactDirRelative,
			files: integrationFiles.map((file) => file.treeItem.path),
		},
		"Workflow smoke started",
	);

	const stats = await runner.run();

	log.info({ stats }, "Workflow smoke finished");

	return stats;
}

/**
 * @param stats Runner result from {@link runWorkflowSmoke}
 *
 * @returns `true` when every discovered file translated successfully
 */
export function workflowSmokeSucceeded(stats: WorkflowStatistics) {
	return (
		stats.totalCount > 0 && stats.failureCount === 0 && stats.successCount === stats.totalCount
	);
}
