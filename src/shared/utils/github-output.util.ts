import { appendFileSync } from "node:fs";

import { ApplicationError, ErrorCode } from "@/shared/errors/";

/**
 * Appends a single-line value to a GitHub Actions output file.
 *
 * @param name Output id consumed by workflow `steps.<id>.outputs.<name>`
 * @param value Scalar output (must not contain raw newlines)
 * @param githubOutputPath Absolute path to `GITHUB_OUTPUT`
 *
 * @throws {ApplicationError} with {@link ErrorCode.InitializationError|`"INITIALIZATION_ERROR"`} when `value` contains a newline
 *
 * @example
 * ```typescript
 * appendGitHubActionsOutput("has_backlog", "true", env.GITHUB_OUTPUT);
 * ```
 */
export function appendGitHubActionsOutput(name: string, value: string, githubOutputPath: string) {
	if (value.includes("\n")) {
		throw new ApplicationError(
			`GitHub Actions output "${name}" must be a single line`,
			ErrorCode.InitializationError,
			"appendGitHubActionsOutput",
			{ name },
		);
	}

	appendFileSync(githubOutputPath, `${name}=${value}\n`);
}
