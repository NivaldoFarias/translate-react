/**
 * Builds the translation workflow matrix for manual `workflow_dispatch` runs.
 *
 * Reads `.github/upstream-locales.json`, optional `--langs`, and writes `matrix` / `has_matrix` to `GITHUB_OUTPUT`.
 *
 * @example
 * ```bash
 * bun run ci:resolve-matrix --langs pt-br,ru
 * ```
 */

import { defineCommand, runCommand } from "citty";

import { resolveCiScriptContext } from "@/ci/schemas/env.schema";
import { TranslationMatrixBuilder } from "@/ci/services/upstream/";
import {
	filterUpstreamLocalesByLang,
	loadUpstreamLocales,
} from "@/ci/services/upstream/upstream-locales.util";
import {
	createWorkflowScriptOctokit,
	writeResolveMatrixWorkflowOutputs,
} from "@/ci/utils/workflow-script.util";
import { createLogger } from "@/shared/utils/create-logger.util";

const log = createLogger({ level: "info", logToConsole: true }).child({
	component: "resolve-matrix",
});

const resolveMatrixCommand = defineCommand({
	meta: {
		name: "resolve-matrix",
		description: "Build translation workflow matrix for manual dispatch",
	},
	args: {
		langs: {
			type: "string",
			description: "Comma-separated locale ids (empty = all configured locales)",
			default: "",
		},
	},
	async run({ args }) {
		const langs = args.langs
			.split(",")
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);

		log.debug({ langsArgument: args.langs, langs }, "Parsed CLI arguments");

		const context = resolveCiScriptContext();

		log.debug(
			{
				repository: context.repositorySlug,
				forkOwner: context.forkOwner,
				requestedLangs: langs,
			},
			"Workflow script environment ready",
		);

		const locales = filterUpstreamLocalesByLang(loadUpstreamLocales(), langs);

		log.debug({ localeCount: locales.length }, "Upstream locales selected for matrix");

		const octokit = createWorkflowScriptOctokit(context);
		const builder = new TranslationMatrixBuilder(octokit, log);

		const matrix = await builder.build(locales, context.forkOwner);

		log.info({ langs: matrix.map((row) => row.lang) }, "Translation matrix resolved");

		writeResolveMatrixWorkflowOutputs(log, matrix);
	},
});

await runCommand(resolveMatrixCommand, { rawArgs: process.argv.slice(2) });
