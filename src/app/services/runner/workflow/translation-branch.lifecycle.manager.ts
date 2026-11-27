import type { ProcessedFileResult } from "@/app/services/github/types";

import type { RunnerServiceDependencies } from "../runner.types";

import type { TranslationPullRequestValidity } from "./translation-pull-request-validity.manager";

import { TranslationFile } from "@/app/services/translator/";
import {
	baseLogger,
	getTranslationBranchNameFromPath,
	isConfiguredForceRetranslatePath,
	shouldPreserveOpenPullRequestOnRefresh,
} from "@/app/utils/";

import { hasQualifyingApprovedReview } from "./pull-request-review.util";

/** Translated content and commit message for {@link TranslationBranchLifecycleManager.commitTranslation} */
export interface TranslationCommitContent {
	/** UTF-8 translated file body */
	content: string;

	/** Commit message for the translation */
	message: string;
}

/**
 * Branch commit and cleanup policy for the per-file translation workflow.
 *
 * Never deletes or resets the head branch of an open pull request: the branch moves only
 * to a finished translation commit, and cleanup skips branches with an open pull request.
 */
export class TranslationBranchLifecycleManager {
	private readonly logger = baseLogger.child({ component: TranslationBranchLifecycleManager.name });

	/**
	 * @param services GitHub and related runner dependencies
	 */
	constructor(private readonly services: RunnerServiceDependencies) {}

	/**
	 * Commits a finished translation and points its branch at the commit.
	 *
	 * Keeps an open pull request when it should be refreshed in place (out of sync,
	 * force-retranslate, or approved). Otherwise closes it first, so the new commit
	 * opens a fresh pull request.
	 *
	 * @param file Translation file being processed
	 * @param validity Pull request validity from the start of file processing
	 * @param commit Translated content and commit message
	 *
	 * @returns Branch reference pointing at the translation commit
	 */
	public async commitTranslation(
		file: TranslationFile,
		validity: TranslationPullRequestValidity,
		commit: TranslationCommitContent,
	) {
		const branchName = getTranslationBranchNameFromPath(file.path);

		if (shouldPreserveOpenPullRequestOnRefresh(file.path, validity)) {
			this.logger.info(
				{
					filename: file.filename,
					prNumber: validity.pullRequest?.number,
					branchName,
					invalidReason: validity.invalidReason ?? null,
					forceRetranslate: isConfiguredForceRetranslatePath(file.path),
				},
				"Refreshing translation branch while preserving open pull request",
			);
		} else {
			await this.closeUnapprovedPullRequest(file, branchName);
		}

		return this.services.github.commitTranslation({ branchName, file, ...commit });
	}

	/**
	 * Closes the open translation pull request on `branchName` unless it has a qualifying approval.
	 *
	 * @param file Translation file being processed
	 * @param branchName Translation branch name without the `refs/heads/` prefix
	 */
	private async closeUnapprovedPullRequest(file: TranslationFile, branchName: string) {
		const existingPullRequest = await this.services.github.findPullRequestByBranch(branchName);

		if (!existingPullRequest) return;

		const reviews = await this.services.github.listPullRequestReviews(existingPullRequest.number);

		if (hasQualifyingApprovedReview(reviews)) {
			this.logger.info(
				{ filename: file.filename, prNumber: existingPullRequest.number, branchName },
				"Preserving approved translation pull request; refreshing branch without closing",
			);

			return;
		}

		this.logger.info(
			{ filename: file.filename, prNumber: existingPullRequest.number, branchName },
			"Closing open translation pull request before committing a fresh translation",
		);

		await this.services.github.createCommentOnPullRequest(
			existingPullRequest.number,
			"This PR is being closed so the translation branch can be refreshed from the current upstream source.",
		);
		await this.services.github.closePullRequest(existingPullRequest.number);
	}

	/**
	 * Deletes the translation branch after a failed attempt, unless it has an open pull request.
	 *
	 * Prevents stale branches from piling up in the fork. A branch with an open pull request
	 * is kept: deleting it would leave the pull request without a head branch.
	 *
	 * @param metadata The processing result metadata containing branch information
	 */
	public async cleanupFailedTranslation(metadata: ProcessedFileResult): Promise<void> {
		if (!metadata.branch?.ref) return;

		const branchName = metadata.branch.ref.replace("refs/heads/", "");

		try {
			const openPullRequest = await this.services.github.findPullRequestByBranch(branchName);

			if (openPullRequest) {
				this.logger.info(
					{ branchName, filename: metadata.filename, prNumber: openPullRequest.number },
					"Kept branch after failed translation because it has an open pull request",
				);
				return;
			}

			await this.services.github.deleteBranch(branchName);
			this.logger.info(
				{ branchName, filename: metadata.filename },
				"Cleaned up branch after failed translation",
			);
		} catch (error) {
			this.logger.error(
				{ error, filename: metadata.filename, branchRef: metadata.branch.ref },
				"Failed to cleanup branch after translation failure - non-critical",
			);
		}
	}
}
