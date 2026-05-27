/**
 * Compares upstream default-branch SHAs to repository variables and writes a translation matrix to `GITHUB_OUTPUT`.
 *
 * Invoked by [`.github/workflows/upstream-poll.yml`](../../.github/workflows/upstream-poll.yml).
 * Configure via `getCiEnv()` (`GH_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_OUTPUT`, optional `GITHUB_REPOSITORY_OWNER`).
 *
 * @example
 * ```bash
 * bun run ci:poll-upstream
 * ```
 */

import { resolveCiWorkflowScriptContext } from "@/ci/env/ci-script-context";
import { createWorkflowScriptOctokit, writePollWorkflowOutputs } from "@/ci/lib/script-helpers";
import { loadUpstreamLocales } from "@/ci/lib/upstream-locales";
import { UpstreamShaPoller, UpstreamShaVariableReader } from "@/ci/upstream/";
import { createLogger } from "@/shared/utils/create-logger.util";

const log = createLogger({ level: "info", logToConsole: true }).child({
	component: "poll-upstream",
});

async function main() {
	log.debug("Validating workflow script environment");

	const context = resolveCiWorkflowScriptContext();

	log.debug(
		{
			repository: context.repositorySlug,
			forkOwner: context.forkOwner,
			githubOutputPath: context.githubOutputPath,
		},
		"Workflow script environment ready",
	);

	const octokit = createWorkflowScriptOctokit(context);

	log.debug("Loading upstream locale registry");

	const locales = loadUpstreamLocales();

	log.debug({ localeCount: locales.length }, "Upstream locale registry loaded");

	const variableReader = new UpstreamShaVariableReader(octokit, context.repository, log);
	const poller = new UpstreamShaPoller(octokit, variableReader, log);

	log.debug("Polling upstream repositories for SHA changes");

	const result = await poller.poll(locales, context.forkOwner);

	log.info(
		{
			hasChanges: result.hasChanges,
			langs: result.matrix.map((row) => row.lang),
		},
		"Upstream poll finished",
	);

	writePollWorkflowOutputs(log, result.hasChanges, result.matrix);
}

await main();
