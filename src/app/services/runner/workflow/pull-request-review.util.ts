import type { PullRequestReviewSnapshot } from "@/app/services/github/types";

/** GitHub `author_association` values that count as qualifying translation PR reviewers */
const REVIEWER_FEEDBACK_ASSOCIATIONS = new Set(["COLLABORATOR", "CONTRIBUTOR", "MEMBER", "OWNER"]);

/** Bot logins excluded from approved-review preservation checks */
const IGNORED_REVIEWER_LOGINS = new Set(["github-actions[bot]", "vercel[bot]"]);

/**
 * Whether a pull request review author may preserve an approved translation pull request.
 *
 * @param review Normalized pull request review author fields
 *
 * @returns `true` for repository members, collaborators, and contributors, excluding known bots
 */
function isQualifyingReviewer(
	review: Pick<PullRequestReviewSnapshot, "login" | "userType" | "authorAssociation">,
) {
	if (review.userType === "Bot") {
		return false;
	}

	if (IGNORED_REVIEWER_LOGINS.has(review.login)) {
		return false;
	}

	return REVIEWER_FEEDBACK_ASSOCIATIONS.has(review.authorAssociation);
}

/**
 * Whether a qualifying maintainer left an `APPROVED` review as their latest submission.
 *
 * @param reviews Pull request reviews on the translation pull request
 *
 * @returns `true` when the latest qualifying review per author is `APPROVED`
 */
export function hasQualifyingApprovedReview(reviews: readonly PullRequestReviewSnapshot[]) {
	const latestReviewByLogin = new Map<string, PullRequestReviewSnapshot>();

	for (const review of reviews) {
		if (!isQualifyingReviewer(review)) {
			continue;
		}

		const existing = latestReviewByLogin.get(review.login);
		if (!existing || review.submittedAt > existing.submittedAt) {
			latestReviewByLogin.set(review.login, review);
		}
	}

	return [...latestReviewByLogin.values()].some((review) => review.state === "APPROVED");
}
