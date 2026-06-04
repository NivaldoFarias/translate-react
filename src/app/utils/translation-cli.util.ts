import { parseArgs } from "citty";

import type { ArgsDef } from "citty";

import { validateEnv } from "../schemas/env.schema";

/** CLI flags that override per-locale matrix values before env validation */
export const translationCliArgs = {
	"lang": {
		type: "string",
		description: "Target locale (`TARGET_LANGUAGE`)",
		alias: "l",
	},
	"fork-owner": {
		type: "string",
		description: "Fork repository owner (`REPO_FORK_OWNER`)",
	},
	"fork-name": {
		type: "string",
		description: "Fork repository name (`REPO_FORK_NAME`)",
	},
	"upstream-owner": {
		type: "string",
		description: "Upstream repository owner (`REPO_UPSTREAM_OWNER`)",
	},
	"upstream-name": {
		type: "string",
		description: "Upstream repository name (`REPO_UPSTREAM_NAME`)",
	},
	"translation-guidelines-file": {
		type: "string",
		description: "Upstream guidelines filename (`TRANSLATION_GUIDELINES_FILE`)",
	},
} satisfies ArgsDef;

const translationCliEnvKeys: Record<keyof typeof translationCliArgs, string> = {
	"lang": "TARGET_LANGUAGE",
	"fork-owner": "REPO_FORK_OWNER",
	"fork-name": "REPO_FORK_NAME",
	"upstream-owner": "REPO_UPSTREAM_OWNER",
	"upstream-name": "REPO_UPSTREAM_NAME",
	"translation-guidelines-file": "TRANSLATION_GUIDELINES_FILE",
};
/**
 * Applies translation workflow CLI flags to `import.meta.env` before {@link validateEnv} runs.
 *
 * Only non-empty flag values are written. Repository secrets and GitHub Environment variables
 * should stay in the process environment; matrix-specific repo coordinates belong on the CLI.
 *
 * @param rawArgs Arguments after the script path (typically `process.argv.slice(2)`)
 *
 * @example
 * ```bash
 * bun run start -- --lang pt-br --fork-owner my-org --fork-name react-pt-br
 * ```
 */
export function applyTranslationCliOverrides(rawArgs: string[]) {
	const parsed = parseArgs(rawArgs, translationCliArgs) as Record<
		string,
		string | boolean | undefined
	>;

	for (const flag of Object.keys(translationCliEnvKeys) as (keyof typeof translationCliEnvKeys)[]) {
		const value = parsed[flag];
		const envKey = translationCliEnvKeys[flag];

		if (typeof value !== "string" || value.length === 0) {
			continue;
		}

		import.meta.env[envKey] = value;
	}
}
