import { execSync } from "node:child_process";

import type { Environment } from "@/app/schemas/env.schema";

import { env } from "@/app/schemas/env.schema";

/**
 * Resolves the OpenRouter `user` field for run attribution on completions and `/generation` records.
 *
 * Priority: GitHub Actions run fingerprint, then `baseline-<git-short-sha>` for local runs.
 *
 * @param environment Validated environment (defaults to process env)
 *
 * @returns Stable external user id for the current run
 *
 * @example
 * ```typescript
 * buildOpenRouterRunUserId();
 * // ^? "gha-25802803407-pt-br"
 * ```
 */
export function buildOpenRouterRunUserId(environment: Environment = env) {
	if (environment.GITHUB_ACTIONS && environment.GITHUB_RUN_ID) {
		return `gha-${environment.GITHUB_RUN_ID}-${environment.TARGET_LANGUAGE}`;
	}

	return `baseline-${resolveGitShortSha()}`;
}

/**
 * Reads the current repository short commit SHA for local baseline labels.
 *
 * @returns Seven-character git SHA, or `unknown` when git is unavailable
 */
function resolveGitShortSha() {
	try {
		return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
	} catch {
		return "unknown";
	}
}
