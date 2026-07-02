/**
 * Canonical HTML base URL for this workflow runner repository.
 *
 * Used when `GITHUB_REPOSITORY` is unset so PR bodies still link to the correct issue tracker
 * (fork/upstream env vars point at React docs repos, not this tool).
 */
export const WORKFLOW_RUNNER_REPOSITORY_HTML_BASE =
	"https://github.com/NivaldoFarias/translate-react" as const;

/** Maintainer guide linked from every translation PR body */
export const WIKI_FOR_REACT_DOCS_MAINTAINERS_URL =
	`${WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}/wiki/For-React-Docs-Maintainers` as const;

/** Prefix of runner translation commits on fork `translate/…` branches */
export const TRANSLATION_COMMIT_MESSAGE_PREFIX = "docs: translate ";
