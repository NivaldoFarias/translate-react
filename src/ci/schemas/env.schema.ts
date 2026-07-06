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

/** Zod schema for workflow scripts that only write `GITHUB_OUTPUT` */
export const ciWorkflowOutputEnvSchema = z.object({
	GITHUB_OUTPUT: z.string().min(1),
});

/** Parsed CI poll/resolve environment */
export type CiPollResolveEnvironment = z.infer<typeof ciPollResolveEnvSchema>;

/** Parsed CI workflow output environment */
export type CiWorkflowOutputEnvironment = z.infer<typeof ciWorkflowOutputEnvSchema>;

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
 * @returns from `import.meta.env`
 */
export function getCiPollResolveEnv() {
	cachedCiPollResolveEnvironment ??= parseCiPollResolveEnvironment();
	return cachedCiPollResolveEnvironment;
}

/**
 * Validates CI workflow output environment variables.
 *
 * @param environment Source map (defaults to `import.meta.env`)
 *
 * @returns Parsed {@link CiWorkflowOutputEnvironment}
 */
export function parseCiWorkflowOutputEnvironment(environment?: Record<string, unknown>) {
	return ciWorkflowOutputEnvSchema.parse(environment ?? import.meta.env);
}

let cachedCiWorkflowOutputEnvironment: CiWorkflowOutputEnvironment | undefined;

/**
 * Returns parsed CI workflow output environment, parsing once per process.
 *
 * @returns from `import.meta.env`
 */
export function getCiWorkflowOutputEnv() {
	cachedCiWorkflowOutputEnvironment ??= parseCiWorkflowOutputEnvironment();
	return cachedCiWorkflowOutputEnvironment;
}

/** Validated GitHub Actions context for poll/resolve scripts */
export interface CiScriptContext {
	/** GitHub token for Octokit in CI scripts */
	ghToken: string;
	/** Filesystem path to the `GITHUB_OUTPUT` file */
	githubOutputPath: string;
	/** Parsed `GITHUB_REPOSITORY` owner and repo name */
	repository: {
		owner: string;
		repo: string;
	};
	/** Raw `owner/repo` slug from `GITHUB_REPOSITORY` */
	repositorySlug: string;
	/** Fork owner resolved for matrix and SHA variable I/O */
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
