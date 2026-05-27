import type { Environment } from "@/app/env/app.env";
import type { ProgressCommentRunContext } from "@/app/locales/locale.types";

import { env } from "@/app/env/app.env";

type GitHubActionsRunEnvSlice = Pick<
	Environment,
	| "GITHUB_ACTIONS"
	| "GITHUB_SERVER_URL"
	| "GITHUB_REPOSITORY"
	| "GITHUB_RUN_ID"
	| "GITHUB_WORKFLOW"
	| "GITHUB_REF"
	| "GITHUB_REF_NAME"
>;

/**
 * Resolves a short ref label from `GITHUB_REF_NAME` or `GITHUB_REF`.
 *
 * @param runtimeEnv Environment slice to read
 *
 * @returns Branch or tag name, or `undefined` when no ref is available
 */
function resolveGitHubRefLabel(runtimeEnv: GitHubActionsRunEnvSlice) {
	const refName = runtimeEnv.GITHUB_REF_NAME?.trim();

	if (refName && refName.length > 0) {
		return refName;
	}

	const fullRef = runtimeEnv.GITHUB_REF?.trim();

	if (!fullRef) {
		return;
	}

	if (fullRef.startsWith("refs/heads/")) {
		return fullRef.slice("refs/heads/".length);
	}

	if (fullRef.startsWith("refs/tags/")) {
		return fullRef.slice("refs/tags/".length);
	}

	return fullRef;
}

/**
 * Resolves metadata for the current GitHub Actions workflow run when available.
 *
 * Reads validated `GITHUB_*` variables set by the Actions runner. Outside CI,
 * or when required pieces are missing, returns `undefined`.
 *
 * @param runtimeEnv Environment slice to read; defaults to the process {@link env}
 *
 * @returns Run metadata for issue comments and PR bodies, or `undefined` if not in CI
 *
 * @example
 * ```typescript
 * resolveGitHubActionsRunContext();
 * // ^? { refLabel: "main", url: "https://github.com/o/r/actions/runs/1", workflowName: "CI", runId: "1" }
 * ```
 */
export function resolveGitHubActionsRunContext(
	runtimeEnv: GitHubActionsRunEnvSlice = env,
): ProgressCommentRunContext | undefined {
	if (!runtimeEnv.GITHUB_ACTIONS) {
		return;
	}

	const repository = runtimeEnv.GITHUB_REPOSITORY?.trim();
	const runId = runtimeEnv.GITHUB_RUN_ID?.trim();

	if (!repository || !runId) {
		return;
	}

	const refLabel = resolveGitHubRefLabel(runtimeEnv);

	if (!refLabel) {
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

	return { refLabel, url, workflowName, runId };
}
