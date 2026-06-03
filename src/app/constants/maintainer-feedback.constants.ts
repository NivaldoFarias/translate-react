/** Prefix of runner translation commits on fork `translate/…` branches */
export const TRANSLATION_COMMIT_MESSAGE_PREFIX = "docs: translate ";

/**
 * GitHub `author_association` values treated as maintainer feedback on translation PRs.
 *
 * @see {@link https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#about-issue-comments|Issue comments}
 */
export const MAINTAINER_COMMENT_ASSOCIATIONS = new Set(["COLLABORATOR", "MEMBER", "OWNER"]);

/** Bot logins excluded from maintainer-feedback detection */
export const IGNORED_MAINTAINER_FEEDBACK_LOGINS = new Set(["github-actions[bot]", "vercel[bot]"]);
