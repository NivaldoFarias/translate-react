import { getCiPollResolveEnv, getCiWorkflowOutputEnv } from "@/ci/schemas/env.schema";
import { appendGitHubActionsOutput } from "@/shared/utils/github-output.util";

/**
 * Appends a single-line value to the GitHub Actions `GITHUB_OUTPUT` file.
 *
 * @param name Output id consumed by workflow `steps.<id>.outputs.<name>`
 * @param value Scalar output (must not contain raw newlines)
 */
export function writeGitHubActionsOutput(name: string, value: string) {
	appendGitHubActionsOutput(name, value, getCiPollResolveEnv().GITHUB_OUTPUT);
}

/**
 * Appends a workflow output without requiring poll/resolve script credentials.
 *
 * @param name Output id consumed by workflow `steps.<id>.outputs.<name>`
 * @param value Scalar output (must not contain raw newlines)
 */
export function writeCiWorkflowOutput(name: string, value: string) {
	appendGitHubActionsOutput(name, value, getCiWorkflowOutputEnv().GITHUB_OUTPUT);
}
