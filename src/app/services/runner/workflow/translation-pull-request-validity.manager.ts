import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { PullRequestStatus } from "@/app/services/github/types";

import type { RunnerServiceDependencies } from "../runner.types";

import { getTranslationBranchNameFromPath, logger } from "@/app/utils/";

import {
	hasMaintainerFeedbackAfterRunnerCommit,
	isMaintainerFeedbackComment,
} from "./maintainer-feedback.util";

/** Why an open translation pull request is not treated as workflow-complete */
export type TranslationPullRequestInvalidReason =
	| "no_open_pr"
	| "out_of_sync"
	| "not_translated"
	| "needs_maintainer_fix";

/** Outcome of evaluating an open translation pull request for a repository path */
export interface TranslationPullRequestValidity {
	/** Whether the runner should skip translation for this path */
	readonly isValid: boolean;

	/** Open pull request on the translation branch, when one exists */
	readonly pullRequest?: RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number];

	/** Present when {@link TranslationPullRequestValidity.isValid} is `false` */
	readonly invalidReason?: TranslationPullRequestInvalidReason;

	/** Mergeability snapshot used for sync checks */
	readonly pullRequestStatus?: PullRequestStatus;
}

/**
 * Decides whether an open translation PR already satisfies the workflow for a path.
 *
 * Valid when there is an open PR on the `translate/…` branch, fork content is in the
 * target language, the PR is in sync with its base (no merge conflicts), and no maintainer
 * left review feedback on the PR after the latest runner translation commit.
 */
export class TranslationPullRequestValidityManager {
	private readonly logger = logger.child({
		component: TranslationPullRequestValidityManager.name,
	});

	/**
	 * @param services GitHub and language-detector dependencies
	 */
	constructor(private readonly services: RunnerServiceDependencies) {}

	/**
	 * Evaluates whether translation work can be skipped for `filePath`.
	 *
	 * @param filePath Repository path under `src/content/`
	 *
	 * @returns Validity outcome for discovery and per-file processing
	 */
	public async evaluate(filePath: string): Promise<TranslationPullRequestValidity> {
		const branchName = getTranslationBranchNameFromPath(filePath);
		const openPullRequest = await this.services.github.findPullRequestByBranch(branchName);

		if (!openPullRequest) {
			this.logger.debug({ filePath, branchName }, "No open translation pull request for path");

			return { isValid: false, invalidReason: "no_open_pr" };
		}

		const pullRequestStatus = await this.services.github.checkPullRequestStatus(
			openPullRequest.number,
		);

		if (pullRequestStatus.needsUpdate) {
			this.logger.debug(
				{
					filePath,
					prNumber: openPullRequest.number,
					mergeableState: pullRequestStatus.mergeableState,
				},
				"Translation pull request is out of sync with base",
			);

			return {
				isValid: false,
				pullRequest: openPullRequest,
				invalidReason: "out_of_sync",
				pullRequestStatus,
			};
		}

		const forkContent = await this.services.github.getForkFileContentAtBranch(filePath, branchName);

		if (!forkContent?.trim()) {
			this.logger.debug(
				{ filePath, branchName, prNumber: openPullRequest.number },
				"Translation branch has no file content at path",
			);

			return {
				isValid: false,
				pullRequest: openPullRequest,
				invalidReason: "not_translated",
				pullRequestStatus,
			};
		}

		const filename = filePath.split("/").pop() ?? filePath;
		const analysis = await this.services.languageDetector.analyzeLanguage(filename, forkContent);

		if (!analysis.isTranslated) {
			this.logger.debug(
				{
					filePath,
					prNumber: openPullRequest.number,
					detectedLanguage: analysis.detectedLanguage,
					ratio: analysis.ratio,
				},
				"Fork branch content is not detected as translated",
			);

			return {
				isValid: false,
				pullRequest: openPullRequest,
				invalidReason: "not_translated",
				pullRequestStatus,
			};
		}

		const maintainerFeedback = await this.detectUnresolvedMaintainerFeedback(
			openPullRequest.number,
			branchName,
		);

		if (maintainerFeedback) {
			this.logger.debug(
				{
					filePath,
					prNumber: openPullRequest.number,
					latestRunnerCommitAt: maintainerFeedback.latestRunnerCommitAt?.toISOString(),
					maintainerCommentAt: maintainerFeedback.maintainerCommentAt.toISOString(),
				},
				"Translation pull request has maintainer feedback after the latest runner commit",
			);

			return {
				isValid: false,
				pullRequest: openPullRequest,
				invalidReason: "needs_maintainer_fix",
				pullRequestStatus,
			};
		}

		this.logger.debug(
			{
				filePath,
				prNumber: openPullRequest.number,
				mergeableState: pullRequestStatus.mergeableState,
			},
			"Open translation pull request is valid",
		);

		return {
			isValid: true,
			pullRequest: openPullRequest,
			pullRequestStatus,
		};
	}

	/**
	 * Detects maintainer issue comments posted after the latest runner commit on the branch.
	 *
	 * @param prNumber Open translation pull request number
	 * @param branchName Fork branch backing the pull request
	 *
	 * @returns Feedback timing when unresolved maintainer comments exist, otherwise `undefined`
	 */
	private async detectUnresolvedMaintainerFeedback(prNumber: number, branchName: string) {
		const [comments, latestRunnerCommitAt] = await Promise.all([
			this.services.github.listPullRequestIssueComments(prNumber),
			this.services.github.getLatestTranslationCommitTimestamp(branchName),
		]);

		if (!hasMaintainerFeedbackAfterRunnerCommit(comments, latestRunnerCommitAt)) {
			return undefined;
		}

		const maintainerCommentAt = comments
			.filter(
				(comment) =>
					latestRunnerCommitAt !== undefined &&
					isMaintainerFeedbackComment(comment) &&
					comment.createdAt > latestRunnerCommitAt,
			)
			.reduce(
				(latest, comment) => (comment.createdAt > latest ? comment.createdAt : latest),
				latestRunnerCommitAt ?? new Date(0),
			);

		return { latestRunnerCommitAt, maintainerCommentAt };
	}
}
