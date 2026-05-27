import type { Octokit } from "@octokit/rest";
import type { Logger } from "pino";

import type { CiScriptContext } from "@/ci/schemas/env.schema";

import { createOctokit } from "@/shared/clients/octokit/octokit.client";

import { writeGitHubActionsOutput } from "./github-output.util";

/** Default GitHub API request timeout for CI helper scripts (milliseconds) */
const CI_GITHUB_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Builds an authenticated Octokit client for workflow helper scripts.
 *
 * @param context Validated CI script environment from {@link resolveCiScriptContext}
 *
 * @returns Octokit instance using `context.ghToken`
 */
export function createWorkflowScriptOctokit(context: CiScriptContext): Octokit {
	return createOctokit({
		auth: context.ghToken,
		requestTimeoutMs: CI_GITHUB_REQUEST_TIMEOUT_MS,
	});
}

/**
 * Writes standard poll outputs to `GITHUB_OUTPUT`.
 *
 * @param log Logger for the calling script
 * @param hasChanges Whether any upstream locale changed
 * @param matrix Translation matrix JSON payload
 */
export function writePollWorkflowOutputs(log: Logger, hasChanges: boolean, matrix: unknown) {
	log.debug(
		{ hasChanges, matrixRowCount: Array.isArray(matrix) ? matrix.length : 0 },
		"Writing poll outputs",
	);

	writeGitHubActionsOutput("has_changes", String(hasChanges));
	writeGitHubActionsOutput("matrix", JSON.stringify(matrix));
}

/**
 * Writes standard manual-matrix outputs to `GITHUB_OUTPUT`.
 *
 * @param log Logger for the calling script
 * @param matrix Translation matrix JSON payload
 */
export function writeResolveMatrixWorkflowOutputs(log: Logger, matrix: unknown[]) {
	const hasMatrix = matrix.length > 0;

	log.debug({ hasMatrix, matrixRowCount: matrix.length }, "Writing resolve-matrix outputs");

	writeGitHubActionsOutput("has_matrix", hasMatrix ? "true" : "false");
	writeGitHubActionsOutput("matrix", JSON.stringify(matrix));
}
