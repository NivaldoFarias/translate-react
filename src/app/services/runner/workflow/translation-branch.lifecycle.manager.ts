import type { ProcessedFileResult } from "@/app/services/github/types";

import type { RunnerServiceDependencies } from "../runner.types";

import type { TranslationPullRequestValidity } from "./translation-pull-request-validity.manager";

import { TranslationFile } from "@/app/services/translator/";
import { getTranslationBranchNameFromPath, logger } from "@/app/utils/";

import { hasQualifyingApprovedReview } from "./pull-request-review.util";

/**
 * Branch prepare, reset, and cleanup policy for per-file translation workflow.
 */
export class TranslationBranchLifecycleManager {
	private readonly logger = logger.child({ component: TranslationBranchLifecycleManager.name });

	/**
	 * @param services GitHub and related runner dependencies
	 */
	constructor(private readonly services: RunnerServiceDependencies) {}

	/**
	 * Resolves the fork branch for translation: reuses an existing branch when refreshing
	 * an out-of-sync open pull request, otherwise resets from the fork default tip.
	 *
	 * @param file Translation file being processed
	 * @param validity Pull request validity from the start of file processing
	 *
	 * @returns Branch reference to commit the translation on
	 */
	public async prepareTranslationBranch(
		file: TranslationFile,
		validity: TranslationPullRequestValidity,
	) {
		const branchName = getTranslationBranchNameFromPath(file.path);

		if (validity.pullRequest && validity.invalidReason === "out_of_sync") {
			this.logger.info(
				{
					filename: file.filename,
					prNumber: validity.pullRequest.number,
					branchName,
					invalidReason: validity.invalidReason,
				},
				"Refreshing translation branch from fork default while preserving open pull request",
			);

			return this.services.github.refreshTranslationBranchPreservePr(branchName);
		}

		return this.recreateTranslationBranchClosePr(file);
	}

	/**
	 * Closes any open translation PR and recreates the branch from the fork default tip.
	 *
	 * Ensures the subsequent translation commit is the only commit on the topic branch.
	 *
	 * @param file Translation file being processed
	 *
	 * @returns Fresh branch reference for a single translation commit
	 */
	public async recreateTranslationBranchClosePr(file: TranslationFile) {
		const branchName = getTranslationBranchNameFromPath(file.path);
		const existingPullRequest = await this.services.github.findPullRequestByBranch(branchName);

		if (existingPullRequest) {
			const reviews = await this.services.github.listPullRequestReviews(existingPullRequest.number);

			if (hasQualifyingApprovedReview(reviews)) {
				this.logger.info(
					{
						filename: file.filename,
						prNumber: existingPullRequest.number,
						branchName,
					},
					"Preserving approved translation pull request; refreshing branch without closing",
				);

				return this.services.github.refreshTranslationBranchPreservePr(branchName);
			}

			this.logger.info(
				{
					filename: file.filename,
					prNumber: existingPullRequest.number,
					branchName,
				},
				"Closing open translation pull request before branch reset",
			);

			await this.services.github.createCommentOnPullRequest(
				existingPullRequest.number,
				"This PR is being closed so the translation branch can be refreshed from the current upstream source.",
			);
			await this.services.github.closePullRequest(existingPullRequest.number);
		}

		const existingBranch = await this.services.github.getBranch(branchName);

		if (existingBranch) {
			this.logger.info(
				{ filename: file.filename, branchName },
				"Deleting translation branch before reset",
			);
			await this.services.github.deleteBranch(branchName);
		}

		const forkDefaultBranch = await this.services.github.getDefaultBranch("fork");
		const newBranch = await this.services.github.createBranch(branchName, forkDefaultBranch);

		return newBranch.data;
	}

	/**
	 * Deletes a translation branch that still points at the fork default tip after a no-op translation.
	 *
	 * @param branchName Translation branch name without `refs/heads/` prefix
	 * @param branchRef Git ref returned from branch creation or lookup
	 */
	public async deleteIdleTranslationBranchIfAtForkBase(
		branchName: string,
		branchRef: NonNullable<ProcessedFileResult["branch"]>,
	) {
		const branchTipSha = branchRef.object.sha;
		const defaultBranchName = await this.services.github.getDefaultBranch("fork");
		const defaultBranchRef = await this.services.github.getBranch(defaultBranchName);
		const defaultTipSha = defaultBranchRef?.data.object.sha;

		if (!defaultTipSha || branchTipSha !== defaultTipSha) {
			return;
		}

		try {
			await this.services.github.deleteBranch(branchName);
			this.logger.info(
				{ branchName },
				"Deleted translation branch still identical to fork default (no-op translation)",
			);
		} catch (error) {
			this.logger.warn(
				{ branchName, error },
				"Failed to delete redundant translation branch after no-op translation",
			);
		}
	}

	/**
	 * Cleans up resources for failed translation attempts.
	 *
	 * Removes translation branches that were created but failed during processing
	 * to prevent accumulation of stale branches in the repository.
	 *
	 * @param metadata The processing result metadata containing branch information
	 */
	public async cleanupFailedTranslation(metadata: ProcessedFileResult): Promise<void> {
		if (!metadata.branch?.ref) return;

		try {
			const branchName = metadata.branch.ref.replace("refs/heads/", "");
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
