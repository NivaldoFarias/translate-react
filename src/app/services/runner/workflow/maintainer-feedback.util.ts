import type { PullRequestReviewSnapshot } from "@/app/services/github/types";

import {
	IGNORED_MAINTAINER_FEEDBACK_LOGINS,
	REVIEWER_FEEDBACK_ASSOCIATIONS,
	TRANSLATION_COMMIT_MESSAGE_PREFIX,
} from "@/app/constants/maintainer-feedback.constants";

/** Maintainer reviews that triggered a remediation re-translation */
export interface MaintainerFeedbackSnapshot {
	/** Review bodies, oldest first, for the translation prompt */
	readonly bodies: readonly string[];

	/** Unique reviewer logins in review order */
	readonly authorLogins: readonly string[];
}

/**
 * Whether a pull request review author may trigger remediation feedback.
 *
 * @param review Normalized pull request review
 *
 * @returns `true` for repository members, collaborators, and contributors, excluding known bots
 */
export function isReviewerFeedbackAuthor(review: PullRequestReviewSnapshot): boolean {
	if (review.userType === "Bot") {
		return false;
	}

	if (IGNORED_MAINTAINER_FEEDBACK_LOGINS.has(review.login)) {
		return false;
	}

	return REVIEWER_FEEDBACK_ASSOCIATIONS.has(review.authorAssociation);
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
 *
 * @returns Snapshot for the translation prompt and commit attribution, or empty when none
 */
export function getMaintainerFeedbackSnapshot(
	reviews: readonly PullRequestReviewSnapshot[],
	runnerCommitAt: Date | undefined,
): MaintainerFeedbackSnapshot {
	const feedbackReviews = getUnresolvedChangesRequestedReviews(reviews, runnerCommitAt);
	const bodies = feedbackReviews
		.map((review) => review.body)
		.filter((body) => body.trim().length > 0);
	const authorLogins = [
		...new Set(
			feedbackReviews
				.filter((review) => review.body.trim().length > 0)
				.map((review) => review.login),
		),
	];

	return { bodies, authorLogins };
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
