import { z } from "zod";

/** Minimum length required for a valid API token */
export const MIN_API_TOKEN_LENGTH = 20;

const PLACEHOLDER_TOKENS = [
	"CHANGE_ME",
	"dev-token",
	"dev-key",
	"your-token-here",
	"your-key-here",
] as const;

/**
 * Builds a Zod schema for API tokens with shared length, whitespace, and placeholder checks.
 *
 * @param envName Environment variable name used in validation error messages
 *
 * @returns Zod string schema for tokens and API keys
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   GH_TOKEN: createGithubTokenSchema("GH_TOKEN"),
 * });
 * ```
 */
export function createGithubTokenSchema(envName: string) {
	const whitespaceRegex = new RegExp(/\s/);
	return z
		.string()
		.min(MIN_API_TOKEN_LENGTH, `${envName} looks too short; ensure your API key is set`)
		.refine((value) => !whitespaceRegex.test(value), `${envName} must not contain whitespace`)
		.refine(
			(value) => !PLACEHOLDER_TOKENS.includes(value as (typeof PLACEHOLDER_TOKENS)[number]),
			`${envName} appears to be a placeholder. Set a real token`,
		);
}
