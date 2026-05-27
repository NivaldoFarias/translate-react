/**
 * Builds the translation workflow matrix for manual `workflow_dispatch` runs.
 *
 * Reads `.github/upstream-locales.json`, optional `--langs`, and writes `matrix` / `has_matrix` to `GITHUB_OUTPUT`.
 * Configure via `getCiEnv()` (`GH_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_OUTPUT`, optional `GITHUB_REPOSITORY_OWNER`).
 *
 * @example
 * ```bash
 * bun run ci:resolve-matrix --langs pt-br,ru
 * ```
 */

import { parseArgs } from "node:util";

import { resolveCiWorkflowScriptContext } from "@/ci/env/ci-script-context";
import {
	createWorkflowScriptOctokit,
	parseWorkflowLangsArgument,
	writeResolveMatrixWorkflowOutputs,
} from "@/ci/lib/script-helpers";
import { filterUpstreamLocalesByLang, loadUpstreamLocales } from "@/ci/lib/upstream-locales";
import { TranslationMatrixBuilder } from "@/ci/upstream/";
import { createLogger } from "@/shared/utils/create-logger.util";

const log = createLogger({ level: "info", logToConsole: true }).child({
	component: "resolve-matrix",
});

async function main() {
	const { values } = parseArgs({
		options: {
			langs: { type: "string", default: "" },
		},
	});

	log.debug({ langsArgument: values.langs }, "Parsing CLI arguments");

	const langs = parseWorkflowLangsArgument(values.langs);

	log.debug("Validating workflow script environment");

	const context = resolveCiWorkflowScriptContext();

	log.debug(
		{
			repository: context.repositorySlug,
			forkOwner: context.forkOwner,
			requestedLangs: langs,
		},
		"Workflow script environment ready",
	);

	log.debug("Loading and filtering upstream locale registry");

	const locales = filterUpstreamLocalesByLang(loadUpstreamLocales(), langs);

	log.debug({ localeCount: locales.length }, "Upstream locales selected for matrix");

	const octokit = createWorkflowScriptOctokit(context);
	const builder = new TranslationMatrixBuilder(octokit, log);

	log.debug("Building translation matrix from upstream tips");

	const matrix = await builder.build(locales, context.forkOwner);

	log.info({ langs: matrix.map((row) => row.lang) }, "Translation matrix resolved");

	writeResolveMatrixWorkflowOutputs(log, matrix);
}

await main();
