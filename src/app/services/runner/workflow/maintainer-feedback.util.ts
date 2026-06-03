import type { PullRequestIssueCommentSnapshot } from "@/app/services/github/types";

import {
	IGNORED_MAINTAINER_FEEDBACK_LOGINS,
	MAINTAINER_COMMENT_ASSOCIATIONS,
} from "@/app/constants/maintainer-feedback.constants";

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
 * Returns maintainer comment bodies posted after the latest runner commit, oldest first.
 *
 * @param comments Issue comments on the translation pull request
 * @param runnerCommitAt Timestamp of the latest `docs: translate` commit on the branch
 *
 * @returns Markdown bodies to parse for mechanical or section remediation
 */
export function getMaintainerFeedbackCommentBodies(
	comments: readonly PullRequestIssueCommentSnapshot[],
	runnerCommitAt: Date | undefined,
): string[] {
	if (!runnerCommitAt) {
		return [];
	}

	return comments
		.filter((comment) => isMaintainerFeedbackComment(comment) && comment.createdAt > runnerCommitAt)
		.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
		.map((comment) => comment.body)
		.filter((body) => body.trim().length > 0);
}
