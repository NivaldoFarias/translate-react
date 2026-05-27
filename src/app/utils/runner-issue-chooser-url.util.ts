import { env } from "@/app/env/app.env";

import { WORKFLOW_RUNNER_REPOSITORY_HTML_BASE } from "./constants.util";

/** Path segment GitHub uses for the issue template picker */
const ISSUE_CHOOSER_PATH = "/issues/new/choose" as const;

export interface RunnerIssueChooserUrlParams {
	/** Value of `GITHUB_SERVER_URL` when present */
	readonly githubServerUrl: string | undefined;

	/** Value of `GITHUB_REPOSITORY` (`owner/repo`) when present */
	readonly githubRepository: string | undefined;
}

/**
 * Builds the GitHub issue template chooser URL for this workflow runner (not React docs repos).
 *
 * When `githubRepository` is a valid `owner/repo` slug, combines it with `githubServerUrl` (or
 * `https://github.com`). Otherwise uses {@link WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}.
 *
 * @param params GitHub Actions-style repository coordinates
 *
 * @returns Absolute URL ending with `/issues/new/choose`
 *
 * @example
 * ```typescript
 * const url = buildRunnerNewIssueChooserUrl({
 *   githubServerUrl: "https://github.com",
 *   githubRepository: "NivaldoFarias/translate-react",
 * });
 * // ^? `https://github.com/NivaldoFarias/translate-react/issues/new/choose`
 * ```
 */
export function buildRunnerNewIssueChooserUrl(params: RunnerIssueChooserUrlParams) {
	const serverBase = params.githubServerUrl?.replace(/\/$/, "") ?? "https://github.com";
	const repositorySlug = params.githubRepository?.trim();

	if (isGithubRepositorySlug(repositorySlug)) {
		return `${serverBase}/${repositorySlug}${ISSUE_CHOOSER_PATH}`;
	}

	return `${WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}${ISSUE_CHOOSER_PATH}`;
}

/**
 * Resolves the issue chooser URL using validated environment (`GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`).
 *
 * @returns Absolute URL ending with `/issues/new/choose`
 *
 * @example
 * ```typescript
 * const url = resolveRunnerNewIssueChooserUrl();
 * ```
 */
export function resolveRunnerNewIssueChooserUrl() {
	return buildRunnerNewIssueChooserUrl({
		githubServerUrl: env.GITHUB_SERVER_URL,
		githubRepository: env.GITHUB_REPOSITORY,
	});
}

/**
 * Returns whether `value` looks like a `owner/repo` slug from `GITHUB_REPOSITORY`.
 *
 * @param value Raw env value, possibly undefined or empty
 */
function isGithubRepositorySlug(value: string | undefined): value is string {
	if (!value) {
		return false;
	}

	const slashIndex = value.indexOf("/");

	if (slashIndex <= 0 || slashIndex === value.length - 1) {
		return false;
	}

	const owner = value.slice(0, slashIndex);
	const repo = value.slice(slashIndex + 1);

	return owner.length > 0 && repo.length > 0 && !value.includes("//");
}
