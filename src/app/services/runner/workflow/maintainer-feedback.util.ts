import type {
	PullRequestReviewCommentSnapshot,
	PullRequestReviewSnapshot,
	ReviewerFeedbackAuthorSnapshot,
} from "@/app/services/github/types";

import {
	IGNORED_MAINTAINER_FEEDBACK_LOGINS,
	REVIEWER_FEEDBACK_ASSOCIATIONS,
	TRANSLATION_COMMIT_MESSAGE_PREFIX,
} from "@/app/constants/maintainer-feedback.constants";

/** Maintainer reviews that triggered a remediation re-translation */
export interface MaintainerFeedbackSnapshot {
	/** Review summary and inline comment bodies, oldest first, for the translation prompt */
	readonly bodies: readonly string[];

	/** Unique reviewer logins in review order */
	readonly authorLogins: readonly string[];
}

/**
 * Whether a pull request review author may trigger remediation feedback.
 *
 * @param author Normalized pull request review or inline review comment author
 *
 * @returns `true` for repository members, collaborators, and contributors, excluding known bots
 */
export function isReviewerFeedbackAuthor(author: ReviewerFeedbackAuthorSnapshot): boolean {
	if (author.userType === "Bot") {
		return false;
	}

	if (IGNORED_MAINTAINER_FEEDBACK_LOGINS.has(author.login)) {
		return false;
	}

	return REVIEWER_FEEDBACK_ASSOCIATIONS.has(author.authorAssociation);
}

/**
 * Returns qualifying reviews submitted after the latest runner commit, oldest first.
 *
 * @param reviews Pull request reviews on the translation pull request
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit, if any
 *
 * @returns Reviews from qualifying authors posted after that commit
 */
export function getReviewsAfterRunnerCommit(
	reviews: readonly PullRequestReviewSnapshot[],
	runnerCommitAt: Date | undefined,
): PullRequestReviewSnapshot[] {
	if (!runnerCommitAt) {
		return [];
	}

	return reviews
		.filter((review) => isReviewerFeedbackAuthor(review) && review.submittedAt > runnerCommitAt)
		.sort((left, right) => left.submittedAt.getTime() - right.submittedAt.getTime());
}

/**
 * Returns unresolved `CHANGES_REQUESTED` reviews after the latest runner commit.
 *
 * For each qualifying reviewer, only the newest submitted review counts. Remediation runs
 * when that latest review is still `CHANGES_REQUESTED` (for example after an approval on
 * an older commit, or a newer `APPROVED` review supersedes an earlier request).
 *
 * @param reviews Pull request reviews on the translation pull request
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit, if any
 *
 * @returns Unresolved change-request reviews, oldest first
 */
export function getUnresolvedChangesRequestedReviews(
	reviews: readonly PullRequestReviewSnapshot[],
	runnerCommitAt: Date | undefined,
): PullRequestReviewSnapshot[] {
	const reviewsAfterCommit = getReviewsAfterRunnerCommit(reviews, runnerCommitAt);
	const latestReviewByLogin = new Map<string, PullRequestReviewSnapshot>();

	for (const review of reviewsAfterCommit) {
		latestReviewByLogin.set(review.login, review);
	}

	return [...latestReviewByLogin.values()]
		.filter((review) => review.state === "CHANGES_REQUESTED")
		.sort((left, right) => left.submittedAt.getTime() - right.submittedAt.getTime());
}

/**
 * Whether an unresolved `CHANGES_REQUESTED` review exists after the latest runner commit.
 *
 * @param reviews Pull request reviews on the translation pull request
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit, if any
 *
 * @returns `true` when remediation should run
 */
export function hasUnresolvedChangesRequestedReview(
	reviews: readonly PullRequestReviewSnapshot[],
	runnerCommitAt: Date | undefined,
): boolean {
	return getUnresolvedChangesRequestedReviews(reviews, runnerCommitAt).length > 0;
}

/**
 * Builds maintainer feedback bodies and author logins for remediation re-translations.
 *
 * @param reviews Pull request reviews on the translation pull request
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit on the branch
 * @param reviewComments Inline pull request review comments on the translation pull request
 *
 * @returns Snapshot for the translation prompt and commit attribution, or empty when none
 */
export function getMaintainerFeedbackSnapshot(
	reviews: readonly PullRequestReviewSnapshot[],
	runnerCommitAt: Date | undefined,
	reviewComments: readonly PullRequestReviewCommentSnapshot[] = [],
): MaintainerFeedbackSnapshot {
	const feedbackReviews = getUnresolvedChangesRequestedReviews(reviews, runnerCommitAt);
	const feedback: RemediationFeedbackScope = {
		reviewIds: new Set(feedbackReviews.map((review) => review.id)),
		authorLogins: new Set(feedbackReviews.map((review) => review.login)),
	};

	const reviewBodies = feedbackReviews
		.filter((review) => (review.body ?? "").trim().length > 0)
		.map((review) => (review.body ?? "").trim());

	const inlineBodies = reviewComments
		.filter((comment) => isInlineReviewCommentForRemediation(comment, runnerCommitAt, feedback))
		.map((comment) => comment.body.trim());

	const bodies = [...reviewBodies, ...inlineBodies];
	const authorLogins = [...new Set(feedbackReviews.map((review) => review.login))];

	return { bodies, authorLogins };
}

/** Unresolved `CHANGES_REQUESTED` reviews that scope inline comment inclusion */
interface RemediationFeedbackScope {
	/** Review ids submitted after the latest runner commit */
	readonly reviewIds: ReadonlySet<number>;

	/** Author logins for those unresolved reviews */
	readonly authorLogins: ReadonlySet<string>;
}

/**
 * Whether an inline review comment should feed maintainer remediation feedback.
 *
 * @param comment Normalized inline pull request review comment
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit, if any
 * @param feedback Unresolved `CHANGES_REQUESTED` review ids and author logins after that commit
 *
 * @returns `true` when the comment body should reach the remediation prompt
 */
function isInlineReviewCommentForRemediation(
	comment: PullRequestReviewCommentSnapshot,
	runnerCommitAt: Date | undefined,
	feedback: RemediationFeedbackScope,
) {
	if (!runnerCommitAt || comment.createdAt <= runnerCommitAt) {
		return false;
	}

	if (!isReviewerFeedbackAuthor(comment) || comment.body.trim().length === 0) {
		return false;
	}

	if (comment.pullRequestReviewId !== null && feedback.reviewIds.has(comment.pullRequestReviewId)) {
		return true;
	}

	return feedback.authorLogins.has(comment.login);
}

/**
 * Builds the fork commit message for a translated file.
 *
 * @param filename Basename of the translated markdown file
 * @param languageName Human-readable target language name
 * @param maintainerAuthorLogins Maintainer logins when re-translating after PR review feedback
 *
 * @returns Subject line, with an optional body attributing maintainer feedback
 */
export function buildTranslationCommitMessage(
	filename: string,
	languageName: string,
	maintainerAuthorLogins?: readonly string[],
) {
	const subject = `${TRANSLATION_COMMIT_MESSAGE_PREFIX}\`${filename}\` to ${languageName}`;

	if (!maintainerAuthorLogins || maintainerAuthorLogins.length === 0) {
		return subject;
	}

	const mentions = maintainerAuthorLogins.map((login) => `@${login}`).join(", ");

	return `${subject}\n\nper ${mentions} feedback`;
}
