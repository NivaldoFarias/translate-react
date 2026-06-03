/**
 * Compares upstream default-branch SHAs to repository variables and writes a translation matrix to `GITHUB_OUTPUT`.
 *
 * Invoked by [`.github/workflows/poll.yml`](../../.github/workflows/poll.yml).
 *
 * @example
 * ```bash
 * bun run ci:poll-upstream
 * ```
 */

import { resolveCiScriptContext } from "@/ci/schemas/env.schema";
import { UpstreamShaPoller, UpstreamShaVariableReader } from "@/ci/services/upstream/";
import { loadUpstreamLocales } from "@/ci/services/upstream/upstream-locales.util";
import {
	createWorkflowScriptOctokit,
	writePollWorkflowOutputs,
} from "@/ci/utils/workflow-script.util";
import { createLogger } from "@/shared/utils/create-logger.util";

const log = createLogger({ level: "info", logToConsole: true }).child({
	component: "poll-upstream",
});

/**
 *
 */
async function main() {
	const context = resolveCiScriptContext();

	log.debug(
		{
			repository: context.repositorySlug,
			forkOwner: context.forkOwner,
			githubOutputPath: context.githubOutputPath,
		},
		"Workflow script environment ready",
	);

	const octokit = createWorkflowScriptOctokit(context);
	const locales = loadUpstreamLocales();

	const variableReader = new UpstreamShaVariableReader(octokit, context.repository, log);
	const poller = new UpstreamShaPoller(octokit, variableReader, log);

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
