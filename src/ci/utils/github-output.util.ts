import { appendFileSync } from "node:fs";

import { getCiPollResolveEnv, getCiWorkflowOutputEnv } from "@/ci/schemas/env.schema";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

/**
 * Appends a single-line value to a GitHub Actions output file.
 *
 * @param name Output id consumed by workflow `steps.<id>.outputs.<name>`
 * @param value Scalar output (must not contain raw newlines)
 * @param githubOutputPath Absolute path to `GITHUB_OUTPUT`
 */
function writeGitHubActionsOutputToPath(name: string, value: string, githubOutputPath: string) {
	if (value.includes("\n")) {
		throw new ApplicationError(
			`GitHub Actions output "${name}" must be a single line`,
			ErrorCode.InitializationError,
			"writeGitHubActionsOutput",
			{ name },
		);
	}

	appendFileSync(githubOutputPath, `${name}=${value}\n`);
}

/**
 * Appends a single-line value to the GitHub Actions `GITHUB_OUTPUT` file.
 *
 * @param name Output id consumed by workflow `steps.<id>.outputs.<name>`
 * @param value Scalar output (must not contain raw newlines)
 */
export function writeGitHubActionsOutput(name: string, value: string) {
	writeGitHubActionsOutputToPath(name, value, getCiPollResolveEnv().GITHUB_OUTPUT);
}

/**
 * Appends a workflow output without requiring poll/resolve script credentials.
 *
 * @param name Output id consumed by workflow `steps.<id>.outputs.<name>`
 * @param value Scalar output (must not contain raw newlines)
 */
export function writeCiWorkflowOutput(name: string, value: string) {
	writeGitHubActionsOutputToPath(name, value, getCiWorkflowOutputEnv().GITHUB_OUTPUT);
}
