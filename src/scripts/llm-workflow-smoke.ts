/**
 * Runs `RunnerService` once with real `translatorService` (live LLM) and mocked GitHub.
 * Use `bun run smoke:llm-workflow`, not `bun test` — the test preload replaces `env`.
 *
 * Optional `LLM_WORKFLOW_SMOKE_MARKDOWN`: repo-relative path to a `.md` file for a larger run.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { GitHubService } from "@/services/github/";
import type { LanguageCacheEntry, RunnerServiceDependencies } from "@/services/runner/runner.types";

import { CacheService } from "@/services/cache/";
import { languageDetectorService } from "@/services/language-detector/";
import { localeService } from "@/services/locale/";
import { RunnerService } from "@/services/runner/runner.service";
import { translatorService } from "@/services/translator/translator.service";
import { logger } from "@/utils/";

import {
	createWorkflowGitHubService,
	INTEGRATION_SMALL_MARKDOWN,
} from "@tests/integration/create-integration-runner";

const MARKDOWN_PATH_ENV = "LLM_WORKFLOW_SMOKE_MARKDOWN";

const log = logger.child({ component: "llm-workflow-smoke" });

/** Resolves the markdown content for the smoke run */
async function resolveMarkdownContent() {
	const relative = import.meta.env[MARKDOWN_PATH_ENV];
	if (typeof relative === "string" && relative.trim().length > 0) {
		const absolute = path.resolve(process.cwd(), relative.trim());

		return fs.readFile(absolute, "utf8");
	}

	return INTEGRATION_SMALL_MARKDOWN;
}

async function buildSmokeFile() {
	const content = await resolveMarkdownContent();
	const customPath = import.meta.env[MARKDOWN_PATH_ENV];
	const filename =
		typeof customPath === "string" && customPath.trim().length > 0 ?
			path.basename(customPath.trim())
		:	"workflow-llm-smoke.md";

	return {
		repoPath: `src/content/${filename}`,
		filename,
		content,
		sha: "sha-workflow-llm-smoke",
	};
}

async function main() {
	if (import.meta.env.NODE_ENV === "test") {
		log.error("Use bun run smoke:llm-workflow (bun test mocks env)");
		process.exit(1);
	}

	try {
		const file = await buildSmokeFile();
		const github = createWorkflowGitHubService(file);

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
				model: import.meta.env["LLM_MODEL"],
				markdownBytes: file.content.length,
				repoPath: file.repoPath,
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
