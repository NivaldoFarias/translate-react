import type { Environment } from "./env.util";

import { env } from "./env.util";

type GitHubActionsRunEnvSlice = Pick<
	Environment,
	"GITHUB_ACTIONS" | "GITHUB_SERVER_URL" | "GITHUB_REPOSITORY" | "GITHUB_RUN_ID" | "GITHUB_WORKFLOW"
>;

/**
 * Resolves metadata for the current GitHub Actions workflow run when available.
 *
 * Reads validated `GITHUB_*` variables set by the Actions runner. Outside CI,
 * or when required pieces are missing, returns `undefined`.
 *
 * @param runtimeEnv Environment slice to read; defaults to the process {@link env}
 *
 * @returns URL, workflow display name, and numeric run id, or `undefined` if not in CI
 *
 * @example
 * ```typescript
 * resolveGitHubActionsRunContext();
 * // ^? { url: "https://github.com/o/r/actions/runs/1", workflowName: "CI", runId: "1" }
 * ```
 */
export function resolveGitHubActionsRunContext(runtimeEnv: GitHubActionsRunEnvSlice = env) {
	if (!runtimeEnv.GITHUB_ACTIONS) {
		return;
	}

	const repository = runtimeEnv.GITHUB_REPOSITORY?.trim();
	const runId = runtimeEnv.GITHUB_RUN_ID?.trim();

	if (!repository || !runId) {
		return;
	}

	const serverFromEnv = runtimeEnv.GITHUB_SERVER_URL?.trim();
	const serverBase = (
		serverFromEnv && serverFromEnv.length > 0 ?
			serverFromEnv
		:	"https://github.com").replace(/\/$/, "");
	const url = `${serverBase}/${repository}/actions/runs/${runId}`;
	const namedWorkflow = runtimeEnv.GITHUB_WORKFLOW?.trim();
	const workflowName = namedWorkflow && namedWorkflow.length > 0 ? namedWorkflow : "GitHub Actions";

	return { url, workflowName, runId };
}

/**
 * Builds a short Markdown line linking to the current Actions run for issue comments.
 *
 * @param runtimeEnv Environment slice to read; defaults to the process {@link env}
 *
 * @returns A single-line Markdown fragment, or `undefined` when not running in Actions
 */
export function formatGithubActionsRunIssueLine(runtimeEnv: GitHubActionsRunEnvSlice = env) {
	const context = resolveGitHubActionsRunContext(runtimeEnv);

	if (!context) {
		return;
	}

	return `###### **CI run:** [\`${context.workflowName} #${context.runId}\`](${context.url})`;
}
