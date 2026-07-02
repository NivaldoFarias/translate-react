import { version } from "@package";

import type { ProgressCommentRunContext } from "@/app/locales/types";
import type { Environment } from "@/app/schemas/env.schema";

import { WORKFLOW_RUNNER_REPOSITORY_HTML_BASE } from "@/app/constants";
import { env } from "@/app/schemas/env.schema";

/** Path segment GitHub uses for the issue template picker */
const ISSUE_CHOOSER_PATH = "/issues/new/choose" as const;

export interface RunnerIssueChooserUrlParams {
	/** Value of `GITHUB_SERVER_URL` when present */
	readonly githubServerUrl: string | undefined;

	/** Value of `GITHUB_REPOSITORY` (`owner/repo`) when present */
	readonly githubRepository: string | undefined;
}

/**
 * Resolves the fork branch name used for a documentation path translation PR.
 *
 * @param filePath Repository path such as `src/content/reference/react/legacy.md`
 *
 * @returns Branch name such as `translate/reference/react/legacy.md`
 */
export function getTranslationBranchNameFromPath(filePath: string) {
	return `translate/${filePath.split("/").slice(2).join("/")}`;
}

/**
 * Builds the GitHub issue template chooser URL for this workflow runner (not React docs repos).
 *
 * @param params GitHub Actions-style repository coordinates
 *
 * @returns Absolute URL ending with `/issues/new/choose`
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
 */
export function resolveRunnerNewIssueChooserUrl() {
	return buildRunnerNewIssueChooserUrl({
		githubServerUrl: env.GITHUB_SERVER_URL,
		githubRepository: env.GITHUB_REPOSITORY,
	});
}

type GitHubActionsRunEnvSlice = Pick<
	Environment,
	"GITHUB_ACTIONS" | "GITHUB_SERVER_URL" | "GITHUB_REPOSITORY" | "GITHUB_RUN_ID" | "GITHUB_WORKFLOW"
>;

/**
 * Builds the GitHub release page URL for a `translate-react` version tag.
 *
 * @param runnerVersion Semantic version tag (e.g. `v0.2.2`)
 *
 * @returns Absolute URL to `releases/tag/<runnerVersion>` on the runner repository
 */
export function buildRunnerReleaseUrl(runnerVersion: string) {
	return `${WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}/releases/tag/${runnerVersion}`;
}

/**
 * Resolves metadata for the current GitHub Actions workflow run when available.
 *
 * @param runtimeEnv Environment slice to read; defaults to the process {@link env}
 *
 * @returns Run metadata for issue comments and PR bodies, or `undefined` if not in CI
 */
export function resolveGitHubActionsRunContext(
	runtimeEnv: GitHubActionsRunEnvSlice = env,
): ProgressCommentRunContext | undefined {
	if (!runtimeEnv.GITHUB_ACTIONS) {
		return;
	}

	const repository = runtimeEnv.GITHUB_REPOSITORY?.trim();
	const runId = runtimeEnv.GITHUB_RUN_ID?.trim();

	if (!repository || !runId) {
		return;
	}

	const serverFromEnv = runtimeEnv.GITHUB_SERVER_URL?.trim();
	const serverBase = (
		serverFromEnv && serverFromEnv.length > 0 ?
			serverFromEnv
		:	"https://github.com").replace(/\/$/, "");
	const url = `${serverBase}/${repository}/actions/runs/${runId}`;
	const namedWorkflow = runtimeEnv.GITHUB_WORKFLOW?.trim();
	const workflowName = namedWorkflow && namedWorkflow.length > 0 ? namedWorkflow : "GitHub Actions";
	const runnerVersion = `v${version}`;

	return {
		version: runnerVersion,
		releaseUrl: buildRunnerReleaseUrl(runnerVersion),
		url,
		workflowName,
		runId,
	};
}

/**
 * Type guard for `owner/repo` GitHub repository slugs.
 *
 * @param value Candidate slug from environment or config
 *
 * @returns `true` when `value` contains exactly one `/` with non-empty owner and repo
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
