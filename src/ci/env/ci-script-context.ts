import type { CiEnvironment } from "./ci.env";

import { getCiEnv } from "./ci.env";

/** Validated GitHub Actions context for workflow helper scripts (`poll-upstream`, `resolve-matrix`). */
export interface CiWorkflowScriptContext {
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
 * Derives script context from a parsed {@link CiEnvironment}.
 *
 * @param environment Parsed CI env (defaults to {@link getCiEnv})
 *
 * @returns Repository coordinates and `GITHUB_OUTPUT` path for workflow outputs
 *
 * @example
 * ```typescript
 * const { ghToken, repository, githubOutputPath } = resolveCiWorkflowScriptContext();
 * ```
 */
export function resolveCiWorkflowScriptContext(environment: CiEnvironment = getCiEnv()) {
	const [owner = "", repo = ""] = environment.GITHUB_REPOSITORY.split("/");

	return {
		ghToken: environment.GH_TOKEN,
		githubOutputPath: environment.GITHUB_OUTPUT,
		repository: { owner, repo },
		repositorySlug: environment.GITHUB_REPOSITORY,
		forkOwner: environment.GITHUB_REPOSITORY_OWNER ?? owner,
	} satisfies CiWorkflowScriptContext;
}
