import { version } from "@package";
import prettyBytes from "pretty-bytes";

import type { InvalidFilePullRequest, PullRequestDescriptionMetadata } from "@/app/locales/types";
import type { ProcessedFileResult } from "@/app/services/github/types";
import type { FileProcessingProgress } from "@/app/services/runner/types";

import type { RunnerServiceDependencies } from "../runner.types";

import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationFile } from "@/app/services/translator/";
import {
	env,
	getTranslationBranchNameFromPath,
	isTranslationEquivalentToCurrentBlob,
	logger,
} from "@/app/utils/";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

import { TranslationPullRequestValidityManager } from "./translation-pull-request-validity.manager";
import { MAX_CONSECUTIVE_FAILURES } from "./workflow.constants";

/**
 * Returns the hostname of the configured LLM API base URL for PR metadata.
 *
 * @param baseUrl LLM API base URL from environment
 *
 * @returns Parsed hostname, or the original string when URL parsing fails
 */
function resolveLlmApiHost(baseUrl: string) {
	try {
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
}

/**
 * Manages batch processing and progress tracking for file translations.
 *
 * Coordinates concurrent translation of multiple files with progress reporting,
 * error handling, and resource cleanup. Processes files in batches to manage
 * resources and provides real-time feedback.
 */
export class TranslationBatchManager {
	private readonly logger = logger.child({ component: TranslationBatchManager.name });

	/**
	 * Tracks progress for the current batch of files being processed.
	 *
	 * Used to update logging and generate statistics.
	 */
	private batchProgress = {
		completed: 0,
		successful: 0,
		failed: 0,
	};

	/**
	 * Tracks consecutive failures for circuit breaker pattern.
	 *
	 * Resets to 0 on any successful file processing. When this counter
	 * reaches {@link MAX_CONSECUTIVE_FAILURES}, the workflow terminates
	 * early to prevent wasting resources on systemic failures.
	 */
	private consecutiveFailures = 0;

	private readonly translationPullRequestValidity: TranslationPullRequestValidityManager;

	/**
	 * Initializes the batch manager with service dependencies.
	 *
	 * @param services Injected service dependencies for GitHub and translation
	 * @param invalidPRsByFile Map of files with invalid PRs for notification
	 * @param workflowStartTimestamp Timestamp when workflow started for timing calculations
	 */
	constructor(
		private readonly services: RunnerServiceDependencies,
		private readonly invalidPRsByFile: Map<string, InvalidFilePullRequest>,
		private readonly workflowStartTimestamp: number,
	) {
		this.translationPullRequestValidity = new TranslationPullRequestValidityManager(services);
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
		this.batchProgress.completed = 0;
		this.batchProgress.successful = 0;
		this.batchProgress.failed = 0;

		const results = new Map<string, ProcessedFileResult>();

		const fileResults = await Promise.all(
			batch.map((file, index) => {
				const progress = {
					batchIndex: batchInfo.currentBatch,
					fileIndex: index,
					totalBatches: batchInfo.totalBatches,
					batchSize: batchInfo.batchSize,
				};

				return this.processFile(file, progress);
			}),
		);

		for (const result of fileResults) {
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
	 * Processes a single file through the complete translation workflow.
	 *
	 * ### Workflow Steps
	 *
	 * 1. **Existing PR guard**: Skips when a mergeable open PR already exists for the path
	 * 2. **Branch Creation**: Creates or retrieves translation branch for isolation
	 * 3. **Content Translation**: Translates file content (may involve chunking for large files)
	 * 4. **Commit Operation**: Commits translated content to branch with descriptive message
	 * 5. **Pull Request**: Creates or updates PR with translation and detailed metadata
	 *
	 * ### Timing and Sequencing
	 *
	 * All operations are awaited sequentially to ensure proper workflow ordering:
	 * - Translation must complete before commit
	 * - Commit must complete before PR creation
	 * - Detailed timing logs track each operation's duration for debugging
	 *
	 * @param file File to process through translation workflow
	 * @param _progress Progress tracking information for batch processing
	 *
	 * @returns Processing result metadata including branch, translation, PR, and error info
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.TranslationFailed|`"TRANSLATION_FAILED"`}
	 * If circuit breaker threshold is reached due to consecutive failures
	 */
	private async processFile(
		file: TranslationFile,
		_progress: FileProcessingProgress,
	): Promise<ProcessedFileResult> {
		const metadata: ProcessedFileResult = {
			branch: null,
			filename: file.filename,
			translation: null,
			retries: [],
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
			if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
				throw new ApplicationError(
					`Workflow terminated: ${this.consecutiveFailures} consecutive failures exceeded threshold of ${MAX_CONSECUTIVE_FAILURES}`,
					ErrorCode.TranslationFailed,
					`${TranslationBatchManager.name}.${this.processFile.name}`,
					{
						consecutiveFailures: this.consecutiveFailures,
						threshold: MAX_CONSECUTIVE_FAILURES,
					},
				);
			}

			const skippedForValidTranslationPullRequest = await this.skipIfValidTranslationPullRequest(
				file,
				metadata,
				startTime,
			);

			if (skippedForValidTranslationPullRequest) {
				return skippedForValidTranslationPullRequest;
			}

			const branchStart = Date.now();
			metadata.branch = await this.resetTranslationBranch(file);
			file.logger.debug(
				{ branchRef: metadata.branch.ref, durationMs: Date.now() - branchStart },
				"Step 1/5: Translation branch reset for single-commit workflow",
			);

			const translationStart = Date.now();
			const translationResult = await this.services.translator.translateContent(file);
			metadata.translation = translationResult.content;
			metadata.retries = translationResult.retries;
			file.logger.debug(
				{
					translationSize: metadata.translation.length,
					durationMs: Date.now() - translationStart,
					retryCount: metadata.retries.length,
				},
				"Step 3/5: Translation complete",
			);

			if (isTranslationEquivalentToCurrentBlob(file, metadata.translation)) {
				file.logger.warn(
					{ path: file.path, contentLength: metadata.translation.length },
					"Translation matches existing blob; skipping commit and pull request",
				);

				await this.deleteIdleTranslationBranchIfAtForkBase(
					getTranslationBranchNameFromPath(file.path),
					metadata.branch,
				);

				this.consecutiveFailures = 0;
				this.updateBatchProgress("success");

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
				message: `docs: translate \`${file.filename}\` to ${languageName}`,
			});
			file.logger.debug({ durationMs: Date.now() - commitStart }, "Step 4/5: Commit complete");

			const prStart = Date.now();
			const pullRequestOutcome = await this.openTranslationPullRequest(file, metadata);
			metadata.pullRequest = pullRequestOutcome.pullRequest;
			metadata.pullRequestProgress = pullRequestOutcome.progress;
			file.logger.debug(
				{
					prNumber: metadata.pullRequest.number,
					pullRequestProgress: metadata.pullRequestProgress,
					durationMs: Date.now() - prStart,
				},
				"Step 5/5: Pull request created/updated",
			);

			this.consecutiveFailures = 0;
			this.updateBatchProgress("success");

			file.logger.debug({ totalDurationMs: Date.now() - startTime }, "File processing complete");
		} catch (error) {
			this.consecutiveFailures++;

			file.logger.error({ error, durationMs: Date.now() - startTime }, "File processing failed");

			metadata.error = error instanceof Error ? error : new Error(String(error));
			this.updateBatchProgress("error");

			await this.cleanupFailedTranslation(metadata);
		}

		return metadata;
	}

	/**
	 * Updates progress tracking for the current batch and adjusts success/failure counts.
	 *
	 * This information is used for both real-time feedback and final statistics.
	 *
	 * @param status The processing outcome for the file
	 */
	private updateBatchProgress(status: "success" | "error"): void {
		this.batchProgress.completed++;

		if (status === "success") this.batchProgress.successful++;
		else this.batchProgress.failed++;
	}

	/**
	 * Cleans up resources for failed translation attempts.
	 *
	 * Removes translation branches that were created but failed during processing
	 * to prevent accumulation of stale branches in the repository.
	 *
	 * @param metadata The processing result metadata containing branch information
	 */
	private async cleanupFailedTranslation(metadata: ProcessedFileResult): Promise<void> {
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

	/**
	 * Returns completed metadata when an open translation pull request is already valid.
	 *
	 * @param file Translation file being processed
	 * @param metadata In-progress processing result to populate when skipping
	 * @param startTime Workflow step start time for duration logging
	 *
	 * @returns Filled metadata when skipped, or `null` to continue translation
	 */
	private async skipIfValidTranslationPullRequest(
		file: TranslationFile,
		metadata: ProcessedFileResult,
		startTime: number,
	) {
		const validity = await this.translationPullRequestValidity.evaluate(file.path);

		if (!validity.isValid || !validity.pullRequest) {
			return null;
		}

		metadata.pullRequest = validity.pullRequest;
		metadata.pullRequestProgress = PullRequestProgressAction.Reused;

		this.consecutiveFailures = 0;
		this.updateBatchProgress("success");

		file.logger.info(
			{
				path: file.path,
				prNumber: validity.pullRequest.number,
				mergeableState: validity.pullRequestStatus?.mergeableState,
			},
			"Skipping file with valid existing pull request",
		);

		file.logger.debug(
			{ totalDurationMs: Date.now() - startTime },
			"File processing complete (existing PR)",
		);

		return metadata;
	}

	/**
	 * Deletes a translation branch that still points at the fork default tip after a no-op translation.
	 *
	 * @param branchName Translation branch name without `refs/heads/` prefix
	 * @param branchRef Git ref returned from branch creation or lookup
	 */
	private async deleteIdleTranslationBranchIfAtForkBase(
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
	 * Closes any open translation PR and recreates the branch from the fork default tip.
	 *
	 * Ensures the subsequent translation commit is the only commit on the topic branch.
	 *
	 * @param file Translation file being processed
	 *
	 * @returns Fresh branch reference for a single translation commit
	 */
	private async resetTranslationBranch(file: TranslationFile) {
		const branchName = getTranslationBranchNameFromPath(file.path);
		const existingPullRequest = await this.services.github.findPullRequestByBranch(branchName);

		if (existingPullRequest) {
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
	 * Opens a new upstream pull request for a freshly reset translation branch.
	 *
	 * @param file Translation file being processed
	 * @param processingResult Processing metadata including translation and timing
	 *
	 * @returns Newly created pull request metadata for progress reporting
	 */
	private async openTranslationPullRequest(
		file: TranslationFile,
		processingResult: ProcessedFileResult,
	): Promise<{
		pullRequest: NonNullable<ProcessedFileResult["pullRequest"]>;
		progress: PullRequestProgressAction.Created;
	}> {
		const branchName = getTranslationBranchNameFromPath(file.path);
		const languageName = this.services.languageDetector.getLanguageName(
			this.services.languageDetector.languages.target,
		);
		const pullRequestOptions = {
			title: this.services.locale.definitions.pullRequest.title(file),
			body: this.createPullRequestDescription(file, processingResult, languageName),
			baseBranch: "main",
		};

		this.logger.info(
			{ branchName, title: pullRequestOptions.title },
			"Opening pull request for refreshed translation branch",
		);

		const strayPullRequest = await this.services.github.findPullRequestByBranch(branchName);

		if (strayPullRequest) {
			this.logger.warn(
				{ prNumber: strayPullRequest.number, branchName },
				"Unexpected open pull request before create; closing before opening replacement",
			);
			await this.services.github.closePullRequest(strayPullRequest.number);
		}

		const pullRequest = await this.services.github.createPullRequest({
			branch: branchName,
			...pullRequestOptions,
		});

		return {
			pullRequest,
			progress: PullRequestProgressAction.Created,
		};
	}

	/**
	 * Creates a pull request description for translated content.
	 *
	 * Generates a detailed PR body including translation outcome metrics, runner and LLM
	 * configuration, optional conflict notices, and a link to the maintainer wiki guide.
	 * When a file has an existing invalid PR (with merge conflicts), includes a GitHub Flavored Markdown
	 * alert to inform maintainers about the duplicate PR situation.
	 *
	 * @param file Translation file being processed with original content
	 * @param processingResult Processing metadata
	 * @param languageName Human-readable name of the target translation language
	 *
	 * @returns Markdown-formatted PR description with all components
	 */
	private createPullRequestDescription(
		file: TranslationFile,
		processingResult: ProcessedFileResult,
		languageName: string,
	): string {
		this.logger.info(
			{ file: file.path, language: languageName },
			"Creating pull request description",
		);

		const pullRequestDescriptionMetadata: PullRequestDescriptionMetadata = {
			languageName,
			invalidFilePR: this.invalidPRsByFile.get(file.path),
			content: {
				source: prettyBytes(file.content.length),
				translation: prettyBytes(processingResult.translation?.length ?? 0),
				compressionRatio:
					file.content.length > 0 ?
						((processingResult.translation?.length ?? 0) / file.content.length).toFixed(2)
					:	"unknown",
			},
			timestamps: {
				now: Date.now(),
				workflowStart: this.workflowStartTimestamp,
			},
			runnerVersion: `v${version}`,
			translationModel: env.LLM_MODEL,
			llmApiHost: resolveLlmApiHost(env.LLM_API_BASE_URL),
			nodeEnv: env.NODE_ENV,
			maskVerbatimLargeFences: env.MASK_VERBATIM_LARGE_FENCES,
			retries: processingResult.retries,
		};
		return this.services.locale.definitions.pullRequest.body(
			file,
			processingResult,
			pullRequestDescriptionMetadata,
		);
	}
}
