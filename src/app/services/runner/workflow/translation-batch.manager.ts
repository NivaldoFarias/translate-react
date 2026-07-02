import type { InvalidFilePullRequest } from "@/app/locales/types";
import type { ProcessedFileResult } from "@/app/services/github/types";

import type { RunnerServiceDependencies } from "../runner.types";

import { TranslationFile } from "@/app/services/translator/";
import { logger } from "@/app/utils/";

import { TranslationBranchLifecycleManager } from "./translation-branch.lifecycle.manager";
import { TranslationFileProcessor } from "./translation-file.processor";
import { TranslationPullRequestLifecycleManager } from "./translation-pull-request.lifecycle.manager";

/**
 * Manages batch processing and progress tracking for file translations.
 *
 * Coordinates concurrent translation of multiple files with progress reporting,
 * error handling, and resource cleanup. Processes files in batches to manage
 * resources and provides real-time feedback.
 */
export class TranslationBatchManager {
	private readonly logger = logger.child({ component: TranslationBatchManager.name });
	private readonly fileProcessor: TranslationFileProcessor;

	/**
	 * Tracks progress for the current batch of files being processed.
	 *
	 * Used to update logging and generate statistics.
	 */
	private batchProgress = {
		successful: 0,
		failed: 0,
	};

	/**
	 * Tracks consecutive failures for circuit breaker pattern.
	 *
	 * Resets to 0 on any successful file processing. When this counter
	 * reaches {@link MAX_CONSECUTIVE_FAILURES} in {@link TranslationFileProcessor}, the workflow terminates
	 * early to prevent wasting resources on systemic failures.
	 */
	private consecutiveFailures = 0;

	/**
	 * Initializes the batch manager with service dependencies.
	 *
	 * @param services Injected service dependencies for GitHub and translation
	 * @param invalidPRsByFile Map of files with invalid PRs for notification
	 * @param _workflowStartTimestamp Timestamp when workflow started for timing calculations
	 */
	constructor(
		services: RunnerServiceDependencies,
		invalidPRsByFile: Map<string, InvalidFilePullRequest>,
		_workflowStartTimestamp: number,
	) {
		const branchLifecycle = new TranslationBranchLifecycleManager(services);
		const pullRequestLifecycle = new TranslationPullRequestLifecycleManager(
			services,
			invalidPRsByFile,
		);
		this.fileProcessor = new TranslationFileProcessor(
			services,
			branchLifecycle,
			pullRequestLifecycle,
		);
	}

	/**
	 * Processes files in batches to manage resources and provide progress feedback.
	 *
	 * Splits files into manageable batches, processes each batch concurrently,
	 * updates progress in real-time, and reports batch completion statistics.
	 *
	 * @param files List of files to process
	 * @param batchSize Number of files to process simultaneously
	 *
	 * @returns Map of filename to processing result metadata
	 */
	public async processBatches(
		files: TranslationFile[],
		batchSize: number,
	): Promise<Map<string, ProcessedFileResult>> {
		this.logger.debug(
			{ fileCount: files.length, batchSize },
			"Starting batch processing for translation workflow",
		);

		const batches = this.createBatches(files, batchSize);

		const results = new Map<ProcessedFileResult["filename"], ProcessedFileResult>();

		for (const [batchIndex, batch] of batches.entries()) {
			this.logger.debug(
				{ batch: batchIndex + 1, totalBatches: batches.length, filesInBatch: batch.length },
				`Starting batch ${batchIndex + 1}/${batches.length}`,
			);

			const batchResults = await this.processBatch(batch, {
				currentBatch: batchIndex + 1,
				totalBatches: batches.length,
				batchSize: batch.length,
			});

			for (const [filename, result] of batchResults.entries()) {
				results.set(filename, result);
			}
		}

		this.logger.debug(
			{
				totalProcessed: results.size,
				successful: this.batchProgress.successful,
				failed: this.batchProgress.failed,
			},
			"Batch processing complete",
		);

		return results;
	}

	/**
	 * Creates evenly sized batches from a list of files.
	 *
	 * @param files Files to split into batches
	 * @param batchSize Maximum size of each batch
	 *
	 * @returns Array of file batches
	 */
	private createBatches(files: TranslationFile[], batchSize: number): TranslationFile[][] {
		const batches: TranslationFile[][] = [];

		for (let index = 0; index < files.length; index += batchSize) {
			batches.push(files.slice(index, index + batchSize));
		}

		return batches;
	}

	/**
	 * Processes a single batch of files concurrently.
	 *
	 * @param batch Files in the current batch
	 * @param batchInfo Batch position metadata
	 * @param batchInfo.currentBatch One-based index of the batch being processed
	 * @param batchInfo.totalBatches Total number of batches in the run
	 * @param batchInfo.batchSize Number of files in this batch
	 *
	 * @returns Map of filename to processing result for this batch
	 */
	private async processBatch(
		batch: TranslationFile[],
		batchInfo: { currentBatch: number; totalBatches: number; batchSize: number },
	): Promise<Map<string, ProcessedFileResult>> {
		this.batchProgress.successful = 0;
		this.batchProgress.failed = 0;

		const results = new Map<string, ProcessedFileResult>();

		for (const [index, file] of batch.entries()) {
			const progress = {
				batchIndex: batchInfo.currentBatch,
				fileIndex: index,
				totalBatches: batchInfo.totalBatches,
				batchSize: batchInfo.batchSize,
			};

			const result = await this.fileProcessor.processFile(file, progress, {
				getConsecutiveFailures: () => this.consecutiveFailures,
				resetConsecutiveFailures: () => {
					this.consecutiveFailures = 0;
				},
				incrementConsecutiveFailures: () => {
					this.consecutiveFailures++;
				},
				updateBatchProgress: (status) => {
					this.updateBatchProgress(status);
				},
			});
			results.set(result.filename, result);
		}

		const successRate = Math.round((this.batchProgress.successful / batch.length) * 100);

		this.logger.info(
			{
				batchIndex: batchInfo.currentBatch,
				totalBatches: batchInfo.totalBatches,
				successful: this.batchProgress.successful,
				total: batch.length,
				successRate,
			},
			`Batch ${batchInfo.currentBatch}/${batchInfo.totalBatches} completed: ${this.batchProgress.successful}/${batch.length} successful (${successRate}%)`,
		);

		return results;
	}

	/**
	 * Updates progress tracking for the current batch and adjusts success/failure counts.
	 *
	 * This information is used for both real-time feedback and final statistics.
	 *
	 * @param status The processing outcome for the file
	 */
	private updateBatchProgress(status: "success" | "error"): void {
		if (status === "success") this.batchProgress.successful++;
		else this.batchProgress.failed++;
	}
}
