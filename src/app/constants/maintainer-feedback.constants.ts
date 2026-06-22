/** Prefix of runner translation commits on fork `translate/…` branches */
export const TRANSLATION_COMMIT_MESSAGE_PREFIX = "docs: translate ";

/** Body separator before maintainer attribution on remediation commits */
export const TRANSLATION_REMEDIATION_COMMIT_ATTRIBUTION_INFIX = "\n\nper ";

/**
 * GitHub `author_association` values that may submit review feedback on translation PRs.
 *
 * @see {@link https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28#list-reviews-for-a-pull-request|Pull request reviews}
 */
export const REVIEWER_FEEDBACK_ASSOCIATIONS = new Set([
	"COLLABORATOR",
	"CONTRIBUTOR",
	"MEMBER",
	"OWNER",
]);

/** Bot logins excluded from maintainer-feedback detection */
export const IGNORED_MAINTAINER_FEEDBACK_LOGINS = new Set(["github-actions[bot]", "vercel[bot]"]);
