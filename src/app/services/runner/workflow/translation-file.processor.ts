import type { ProcessedFileResult } from "@/app/services/github/types";
import type { FileProcessingProgress } from "@/app/services/runner/types";

import type { RunnerServiceDependencies } from "../runner.types";

import type { TranslationBranchLifecycleManager } from "./translation-branch.lifecycle.manager";
import type { TranslationPullRequestValidity } from "./translation-pull-request-validity.manager";
import type { TranslationPullRequestLifecycleManager } from "./translation-pull-request.lifecycle.manager";

import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationFile } from "@/app/services/translator/";
import {
	getTranslationBranchNameFromPath,
	isTranslationEquivalentToCurrentBlob,
	logger,
} from "@/app/utils/";
import { ApplicationError, ErrorCode, isCircuitBreakerError } from "@/shared/errors/";

import { buildTranslationCommitMessage } from "./translation-commit.util";
import { TranslationPullRequestValidityManager } from "./translation-pull-request-validity.manager";
import { MAX_CONSECUTIVE_FAILURES } from "./workflow.constants";

/** Mutable batch counters updated by per-file processing */
export interface TranslationBatchProgressCallbacks {
	/** Returns the current consecutive failure count */
	getConsecutiveFailures: () => number;

	/** Resets consecutive failures after a successful file */
	resetConsecutiveFailures: () => void;

	/** Increments consecutive failures after a failed file */
	incrementConsecutiveFailures: () => void;

	/** Updates per-batch success and failure tallies */
	updateBatchProgress: (status: "success" | "error") => void;
}

/**
 * Per-file translation pipeline coordinator for branch, translate, commit, and pull request steps.
 */
export class TranslationFileProcessor {
	private readonly logger = logger.child({ component: TranslationFileProcessor.name });
	private readonly translationPullRequestValidity: TranslationPullRequestValidityManager;

	/**
	 * @param services GitHub, translator, and locale dependencies
	 * @param branchLifecycle Branch prepare and cleanup policy
	 * @param pullRequestLifecycle Pull request open, reuse, and description policy
	 */
	constructor(
		private readonly services: RunnerServiceDependencies,
		private readonly branchLifecycle: TranslationBranchLifecycleManager,
		private readonly pullRequestLifecycle: TranslationPullRequestLifecycleManager,
	) {
		this.translationPullRequestValidity = new TranslationPullRequestValidityManager(services);
	}

	/**
	 * Processes a single file through the complete translation workflow.
	 *
	 * @param file File to process through translation workflow
	 * @param _progress Progress tracking information for batch processing
	 * @param batchProgress Batch-level circuit breaker and progress callbacks
	 *
	 * @returns Processing result metadata including branch, translation, PR, and error info
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.TranslationFailed|`"TRANSLATION_FAILED"`}
	 * If circuit breaker threshold is reached due to consecutive failures
	 */
	public async processFile(
		file: TranslationFile,
		_progress: FileProcessingProgress,
		batchProgress: TranslationBatchProgressCallbacks,
	): Promise<ProcessedFileResult> {
		const metadata: ProcessedFileResult = {
			branch: null,
			filename: file.filename,
			translation: null,
			reviewerNotices: [],
			pullRequest: null,
			pullRequestProgress: null,
			error: null,
		};

		const startTime = Date.now();
		file.logger.debug(
			{ path: file.path, contentSize: file.content.length },
			"Starting file processing",
		);

		try {
			if (batchProgress.getConsecutiveFailures() >= MAX_CONSECUTIVE_FAILURES) {
				throw new ApplicationError(
					`Workflow terminated: ${batchProgress.getConsecutiveFailures()} consecutive failures exceeded threshold of ${MAX_CONSECUTIVE_FAILURES}`,
					ErrorCode.TranslationFailed,
					`${TranslationFileProcessor.name}.${this.processFile.name}`,
					{
						circuitBreaker: true,
						consecutiveFailures: batchProgress.getConsecutiveFailures(),
						threshold: MAX_CONSECUTIVE_FAILURES,
					},
				);
			}

			const pullRequestValidity = await this.translationPullRequestValidity.evaluate(file.path);

			const skippedForValidTranslationPullRequest = this.skipIfValidTranslationPullRequest(
				file,
				metadata,
				startTime,
				pullRequestValidity,
				batchProgress,
			);

			if (skippedForValidTranslationPullRequest) {
				return skippedForValidTranslationPullRequest;
			}

			const branchStart = Date.now();
			metadata.branch = await this.branchLifecycle.prepareTranslationBranch(
				file,
				pullRequestValidity,
			);
			file.logger.debug(
				{
					durationMs: Date.now() - branchStart,
					pullRequestInvalidReason: pullRequestValidity.invalidReason ?? null,
				},
				"Step 1/5: Translation branch prepared",
			);

			const translationStart = Date.now();
			const translationResult = await this.services.translator.translateContent(file);
			metadata.translation = translationResult.content;
			metadata.reviewerNotices = translationResult.reviewerNotices;
			metadata.llmUsage = translationResult.llmUsage;
			const contentRatio =
				file.content.length > 0 ?
					(metadata.translation.length / file.content.length).toFixed(2)
				:	"unknown";

			file.logger.debug(
				{
					translationSize: metadata.translation.length,
					contentRatio,
					durationMs: Date.now() - translationStart,
					advisoryGuardCount: metadata.reviewerNotices.length,
					translationPath: translationResult.translationPath,
					llmUsage: translationResult.llmUsage,
					reviewerNotices: metadata.reviewerNotices,
				},
				"Step 2/5: Translation complete",
			);

			if (isTranslationEquivalentToCurrentBlob(file, metadata.translation)) {
				file.logger.warn(
					{ path: file.path, contentLength: metadata.translation.length },
					"Translation matches existing blob; skipping commit and pull request",
				);

				await this.branchLifecycle.deleteIdleTranslationBranchIfAtForkBase(
					getTranslationBranchNameFromPath(file.path),
					metadata.branch,
				);

				batchProgress.resetConsecutiveFailures();
				batchProgress.updateBatchProgress("success");

				file.logger.debug(
					{ totalDurationMs: Date.now() - startTime },
					"File processing complete (no-op translation)",
				);

				return metadata;
			}

			const languageName = this.services.languageDetector.getLanguageName(
				this.services.languageDetector.languages.target,
			);

			const commitStart = Date.now();
			await this.services.github.commitTranslation({
				file,
				branch: metadata.branch,
				content: metadata.translation,
				message: buildTranslationCommitMessage(file.filename, languageName),
			});
			file.logger.debug({ durationMs: Date.now() - commitStart }, "Step 3/5: Commit complete");

			const prStart = Date.now();
			const pullRequestOutcome = await this.pullRequestLifecycle.openTranslationPullRequest(
				file,
				metadata,
				pullRequestValidity,
			);
			metadata.pullRequest = pullRequestOutcome.pullRequest;
			metadata.pullRequestProgress = pullRequestOutcome.progress;
			file.logger.debug(
				{
					prNumber: metadata.pullRequest.number,
					pullRequestProgress: metadata.pullRequestProgress,
					durationMs: Date.now() - prStart,
				},
				"Step 4/5: Pull request created/updated",
			);

			batchProgress.resetConsecutiveFailures();
			batchProgress.updateBatchProgress("success");

			file.logger.debug({ totalDurationMs: Date.now() - startTime }, "File processing complete");
		} catch (error) {
			if (isCircuitBreakerError(error)) {
				throw error;
			}

			batchProgress.incrementConsecutiveFailures();

			file.logger.error({ error, durationMs: Date.now() - startTime }, "File processing failed");

			metadata.error = error instanceof Error ? error : new Error(String(error));
			batchProgress.updateBatchProgress("error");

			await this.branchLifecycle.cleanupFailedTranslation(metadata);
		}

		return metadata;
	}

	/**
	 * Returns completed metadata when an open translation pull request is already valid.
	 *
	 * @param file Translation file being processed
	 * @param metadata In-progress processing result to populate when skipping
	 * @param startTime Workflow step start time for duration logging
	 * @param validity Pull request validity evaluated at the start of file processing
	 * @param batchProgress Batch-level circuit breaker and progress callbacks
	 *
	 * @returns Filled metadata when skipped, or `null` to continue translation
	 */
	private skipIfValidTranslationPullRequest(
		file: TranslationFile,
		metadata: ProcessedFileResult,
		startTime: number,
		validity: TranslationPullRequestValidity,
		batchProgress: TranslationBatchProgressCallbacks,
	) {
		if (!validity.isValid || !validity.pullRequest) {
			return null;
		}

		metadata.pullRequest = validity.pullRequest;
		metadata.pullRequestProgress = PullRequestProgressAction.Reused;

		batchProgress.resetConsecutiveFailures();
		batchProgress.updateBatchProgress("success");

		file.logger.info(
			{
				path: file.path,
				prNumber: validity.pullRequest.number,
				mergeableState: validity.pullRequestStatus?.mergeableState,
				llmWorkSkipped: true,
				skipReason: "valid_existing_pr",
			},
			"Skipping file with valid existing pull request",
		);

		file.logger.debug(
			{ totalDurationMs: Date.now() - startTime },
			"File processing complete (existing PR)",
		);

		return metadata;
	}
}
