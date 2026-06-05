import type { PullRequestIssueCommentSnapshot } from "@/app/services/github/types";

import {
	IGNORED_MAINTAINER_FEEDBACK_LOGINS,
	MAINTAINER_COMMENT_ASSOCIATIONS,
	TRANSLATION_COMMIT_MESSAGE_PREFIX,
} from "@/app/constants/maintainer-feedback.constants";

/** Maintainer comments that triggered a remediation re-translation */
export interface MaintainerFeedbackSnapshot {
	/** Comment bodies, oldest first, for the translation prompt */
	readonly bodies: readonly string[];

	/** Unique maintainer logins in comment order */
	readonly authorLogins: readonly string[];
}

/**
 * Whether a pull request comment counts as maintainer review feedback.
 *
 * @param comment Normalized issue comment on the translation pull request
 *
 * @returns `true` for repository members and collaborators, excluding known bots
 */
export function isMaintainerFeedbackComment(comment: PullRequestIssueCommentSnapshot): boolean {
	if (comment.userType === "Bot") {
		return false;
	}

	if (IGNORED_MAINTAINER_FEEDBACK_LOGINS.has(comment.login)) {
		return false;
	}

	return MAINTAINER_COMMENT_ASSOCIATIONS.has(comment.authorAssociation);
}

/**
 * Whether maintainer feedback exists after the latest runner commit on the branch.
 *
 * @param comments Issue comments on the translation pull request
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit, if any
 *
 * @returns `true` when a maintainer comment was posted after that commit
 */
export function hasMaintainerFeedbackAfterRunnerCommit(
	comments: readonly PullRequestIssueCommentSnapshot[],
	runnerCommitAt: Date | undefined,
): boolean {
	if (!runnerCommitAt) {
		return false;
	}

	return comments.some(
		(comment) => isMaintainerFeedbackComment(comment) && comment.createdAt > runnerCommitAt,
	);
}

/**
 * Returns maintainer comments posted after the latest runner commit, oldest first.
 *
 * @param comments Issue comments on the translation pull request
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit on the branch
 *
 * @returns Normalized maintainer feedback comments
 */
export function getMaintainerFeedbackComments(
	comments: readonly PullRequestIssueCommentSnapshot[],
	runnerCommitAt: Date | undefined,
): PullRequestIssueCommentSnapshot[] {
	if (!runnerCommitAt) {
		return [];
	}

	return comments
		.filter((comment) => isMaintainerFeedbackComment(comment) && comment.createdAt > runnerCommitAt)
		.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

/**
 * Returns maintainer comment bodies posted after the latest runner commit, oldest first.
 *
 * @param comments Issue comments on the translation pull request
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit on the branch
 *
 * @returns Markdown bodies for the maintainer review section in the translation prompt
 */
export function getMaintainerFeedbackCommentBodies(
	comments: readonly PullRequestIssueCommentSnapshot[],
	runnerCommitAt: Date | undefined,
): string[] {
	return getMaintainerFeedbackComments(comments, runnerCommitAt)
		.map((comment) => comment.body)
		.filter((body) => body.trim().length > 0);
}

/**
 * Builds maintainer feedback bodies and author logins for remediation re-translations.
 *
 * @param comments Issue comments on the translation pull request
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit on the branch
 *
 * @returns Snapshot for the translation prompt and commit attribution, or empty when none
 */
export function getMaintainerFeedbackSnapshot(
	comments: readonly PullRequestIssueCommentSnapshot[],
	runnerCommitAt: Date | undefined,
): MaintainerFeedbackSnapshot {
	const feedbackComments = getMaintainerFeedbackComments(comments, runnerCommitAt);
	const bodies = feedbackComments
		.map((comment) => comment.body)
		.filter((body) => body.trim().length > 0);
	const authorLogins = [
		...new Set(
			feedbackComments
				.filter((comment) => comment.body.trim().length > 0)
				.map((comment) => comment.login),
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
