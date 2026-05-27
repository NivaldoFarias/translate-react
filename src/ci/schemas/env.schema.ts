import { z } from "zod";

import { createGithubTokenSchema } from "@/shared/schemas/github-token.schema";

const ownerRepoPattern = new RegExp(/^[^/]+\/[^/]+$/);

/** Zod schema for GitHub Actions poll/resolve helper scripts */
export const ciPollResolveEnvSchema = z.object({
	GH_TOKEN: createGithubTokenSchema("GH_TOKEN"),
	GITHUB_REPOSITORY: z
		.string()
		.min(1)
		.refine((value) => ownerRepoPattern.test(value), "GITHUB_REPOSITORY must be owner/repo"),
	GITHUB_OUTPUT: z.string().min(1),
	GITHUB_REPOSITORY_OWNER: z.string().optional(),
});

/** Parsed CI poll/resolve environment */
export type CiPollResolveEnvironment = z.infer<typeof ciPollResolveEnvSchema>;

/**
 * Validates CI poll/resolve environment variables.
 *
 * @param environment Source map (defaults to `import.meta.env`)
 *
 * @returns Parsed {@link CiPollResolveEnvironment}
 */
export function parseCiPollResolveEnvironment(environment?: Record<string, unknown>) {
	return ciPollResolveEnvSchema.parse(environment ?? import.meta.env);
}

let cachedCiPollResolveEnvironment: CiPollResolveEnvironment | undefined;

/**
 * Returns parsed CI poll/resolve environment, parsing once per process.
 *
 * @returns {@link CiPollResolveEnvironment} from `import.meta.env`
 */
export function getCiPollResolveEnv() {
	cachedCiPollResolveEnvironment ??= parseCiPollResolveEnvironment();
	return cachedCiPollResolveEnvironment;
}

/** Validated GitHub Actions context for poll/resolve scripts */
export interface CiScriptContext {
	ghToken: string;
	githubOutputPath: string;
	repository: {
		owner: string;
		repo: string;
	};
	repositorySlug: string;
	forkOwner: string;
}

/**
 * Derives script context from a parsed {@link CiPollResolveEnvironment}.
 *
 * @param environment Parsed CI env (defaults to {@link getCiPollResolveEnv})
 *
 * @returns Repository coordinates and `GITHUB_OUTPUT` path for workflow outputs
 */
export function resolveCiScriptContext(
	environment: CiPollResolveEnvironment = getCiPollResolveEnv(),
) {
	const [owner = "", repo = ""] = environment.GITHUB_REPOSITORY.split("/");

	return {
		ghToken: environment.GH_TOKEN,
		githubOutputPath: environment.GITHUB_OUTPUT,
		repository: { owner, repo },
		repositorySlug: environment.GITHUB_REPOSITORY,
		forkOwner: environment.GITHUB_REPOSITORY_OWNER ?? owner,
	} satisfies CiScriptContext;
}
