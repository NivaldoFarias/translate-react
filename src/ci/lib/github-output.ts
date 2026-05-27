import { appendFileSync } from "node:fs";

import { getCiEnv } from "@/ci/env/ci.env";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

/**
 * Appends a single-line value to the GitHub Actions `GITHUB_OUTPUT` file.
 *
 * @param name Output id consumed by workflow `steps.<id>.outputs.<name>`
 * @param value Scalar output (must not contain raw newlines)
 *
 * @example
 * ```typescript
 * writeGitHubActionsOutput("has_changes", "true");
 * ```
 */
export function writeGitHubActionsOutput(name: string, value: string) {
	if (value.includes("\n")) {
		throw new ApplicationError(
			`GitHub Actions output "${name}" must be a single line`,
			ErrorCode.InitializationError,
			"writeGitHubActionsOutput",
			{ name },
		);
	}

	appendFileSync(getCiEnv().GITHUB_OUTPUT, `${name}=${value}\n`);
}
