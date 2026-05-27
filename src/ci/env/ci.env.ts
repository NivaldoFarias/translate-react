import { z } from "zod";

import { createGithubTokenSchema } from "@/shared/env/github-token.schema";

const ownerRepoPattern = new RegExp(/^[^/]+\/[^/]+$/);

/** Zod schema for GitHub Actions poll/resolve helper scripts */
export const ciEnvSchema = z.object({
	GH_TOKEN: createGithubTokenSchema("GH_TOKEN"),
	GITHUB_REPOSITORY: z
		.string()
		.min(1)
		.refine((value) => ownerRepoPattern.test(value), "GITHUB_REPOSITORY must be owner/repo"),
	GITHUB_OUTPUT: z.string().min(1),
	GITHUB_REPOSITORY_OWNER: z.string().optional(),
});

/** Parsed CI workflow script environment */
export type CiEnvironment = z.infer<typeof ciEnvSchema>;

/**
 * Validates CI workflow script environment variables.
 *
 * @param environment Source map (defaults to `import.meta.env`)
 *
 * @returns Parsed {@link CiEnvironment}
 *
 * @throws {z.ZodError} When required variables are missing or invalid
 */
export function parseCiEnvironment(environment?: Record<string, unknown>) {
	return ciEnvSchema.parse(environment ?? import.meta.env);
}

let cachedCiEnvironment: CiEnvironment | undefined;

/**
 * Returns parsed CI environment, parsing once per process.
 *
 * @returns {@link CiEnvironment} from `import.meta.env`
 */
export function getCiEnv() {
	cachedCiEnvironment ??= parseCiEnvironment();
	return cachedCiEnvironment;
}
