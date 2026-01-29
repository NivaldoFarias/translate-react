import prettyBytes from "pretty-bytes";

import type {
	FileProcessingProgress,
	ProcessedFileResult,
	PullRequestStatus,
	RunnerServiceDependencies,
} from "./runner.types";

import { ApplicationError, ErrorCode } from "@/errors/";
import { logger, MAX_CONSECUTIVE_FAILURES } from "@/utils/";

import { LanguageDetectorService } from "../language-detector.service";
import { TranslationFile } from "../translator.service";

export interface InvalidFilePullRequest {
	prNumber: number;
	status: PullRequestStatus;
}

export interface PullRequestDescriptionMetadata {
	languageName: string;
	invalidFilePR: InvalidFilePullRequest | undefined;
	content: {
		source: string;
		translation: string;
		compressionRatio: string;
	};
	timestamps: {
		now: number;
		workflowStart: number;
	};
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
	) {}

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
		const batches = this.createBatches(files, batchSize);

		this.logger.info(
			{
				batchSize,
				totalFiles: files.length,
				totalBatches: batches.length,
				parallelism: batchSize,
			},
			"Batch configuration initialized",
		);

		const results = new Map<ProcessedFileResult["filename"], ProcessedFileResult>();

		for (const [batchIndex, batch] of batches.entries()) {
			const batchResults = await this.processBatch(batch, {
				currentBatch: batchIndex + 1,
				totalBatches: batches.length,
				batchSize: batch.length,
			});

			for (const [filename, result] of batchResults.entries()) {
				results.set(filename, result);
			}
		}

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
	 * @param batchInfo Information about the batch's position in the overall process
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

		this.logger.info(
			batchInfo,
			`Processing batch ${batchInfo.currentBatch}/${batchInfo.totalBatches}`,
		);

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

		this.logger.info(
			{ batchIndex: batchInfo.currentBatch, ...this.batchProgress },
			"Batch processing completed",
		);

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
	 * 1. **Branch Creation**: Creates or retrieves translation branch for isolation
	 * 2. **Content Translation**: Translates file content (may involve chunking for large files)
	 * 3. **Commit Operation**: Commits translated content to branch with descriptive message
	 * 4. **Pull Request**: Creates or updates PR with translation and detailed metadata
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
	 * @throws {ApplicationError} with {@link ErrorCode.TranslationFailed}
	 * If circuit breaker threshold is reached due to consecutive failures
	 *
	 * @returns Processing result metadata including branch, translation, PR, and error info
	 */
	private async processFile(
		file: TranslationFile,
		_progress: FileProcessingProgress,
	): Promise<ProcessedFileResult> {
		const fileStartTime = Date.now();
		const logger = this.logger.child({ component: file.filename });
		const metadata: ProcessedFileResult = {
			branch: null,
			filename: file.filename,
			translation: null,
			pullRequest: null,
			error: null,
		};

		try {
			logger.debug(
				{
					filename: file.filename,
					consecutiveFailures: this.consecutiveFailures,
				},
				"Starting file processing workflow",
			);

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

			const branchStartTime = Date.now();
			metadata.branch = await this.createOrGetTranslationBranch(file);
			const branchDuration = Date.now() - branchStartTime;

			logger.debug(
				{ filename: file.filename, branchRef: metadata.branch.ref, durationMs: branchDuration },
				"Branch creation completed",
			);

			const translationStartTime = Date.now();
			metadata.translation = await this.services.translator.translateContent(file);
			const translationDuration = Date.now() - translationStartTime;

			logger.debug(
				{
					filename: file.filename,
					translatedLength: metadata.translation.length,
					durationMs: translationDuration,
				},
				"Translation completed - proceeding to commit",
			);

			const languageName = this.services.languageDetector.getLanguageName(
				LanguageDetectorService.languages.target,
			);

			const commitStartTime = Date.now();
			await this.services.github.content.commitTranslation({
				file,
				branch: metadata.branch,
				content: metadata.translation,
				message: `docs: translate \`${file.filename}\` to ${languageName}`,
			});
			const commitDuration = Date.now() - commitStartTime;

			logger.debug(
				{ filename: file.filename, durationMs: commitDuration },
				"Commit completed - creating pull request",
			);

			const prStartTime = Date.now();
			metadata.pullRequest = await this.createOrUpdatePullRequest(file, metadata);

			const prDuration = Date.now() - prStartTime;
			const totalDuration = Date.now() - fileStartTime;

			logger.debug(
				{
					filename: file.filename,
					prNumber: metadata.pullRequest.number,
					timing: {
						branchMs: branchDuration,
						translationMs: translationDuration,
						commitMs: commitDuration,
						prMs: prDuration,
						totalMs: totalDuration,
					},
				},
				"File processing completed successfully",
			);

			this.consecutiveFailures = 0;
			this.updateBatchProgress("success");
		} catch (error) {
			this.consecutiveFailures++;

			logger.error({ error }, "File processing failed");

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
			await this.services.github.branch.deleteBranch(branchName);
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
	 * Creates a new branch for translation work, or reuses an existing branch if appropriate.
	 *
	 * This method intelligently handles existing branches by evaluating their associated PRs
	 * for merge conflicts. When a branch already exists, the method checks if there's an open
	 * PR and evaluates its merge status. Branches are only deleted and recreated when their
	 * associated PRs have actual merge conflicts (not when they're simply behind the base branch).
	 *
	 * ### Branch Reuse Scenarios
	 *
	 * 1. **Branch exists with PR having no conflicts**: Reuses existing branch, preserving PR
	 * 2. **Branch exists with PR having conflicts**: Closes PR, deletes branch, creates new branch
	 * 3. **Branch exists without PR**: Reuses existing branch safely
	 * 4. **No existing branch**: Creates new branch from base
	 *
	 * @param file Translation file being processed
	 * @param baseBranch Optional base branch to create from (defaults to fork's default branch)
	 *
	 * @returns Branch reference data containing SHA and branch name for subsequent commit operations
	 */
	private async createOrGetTranslationBranch(file: TranslationFile, baseBranch?: string) {
		const actualBaseBranch =
			baseBranch ?? (await this.services.github.repository.getDefaultBranch("fork"));
		const branchName = `translate/${file.path.split("/").slice(2).join("/")}`;

		this.logger.debug(
			{ filename: file.filename, branchName },
			"Checking for existing translation branch",
		);
		const existingBranch = await this.services.github.branch.getBranch(branchName);

		if (existingBranch) {
			this.logger.debug(
				{ filename: file.filename, branchName },
				"Existing branch found, checking associated PR status",
			);

			const upstreamPR = await this.services.github.content.findPullRequestByBranch(branchName);

			if (upstreamPR) {
				const prStatus = await this.services.github.content.checkPullRequestStatus(
					upstreamPR.number,
				);

				if (prStatus.hasConflicts) {
					this.logger.info(
						{
							filename: file.filename,
							prNumber: upstreamPR.number,
							mergeableState: prStatus.mergeableState,
						},
						"PR has merge conflicts, closing and recreating",
					);
					await this.services.github.content.createCommentOnPullRequest(
						upstreamPR.number,
						"This PR has merge conflicts and is being closed. A new PR with the updated translation will be created.",
					);

					await this.services.github.content.closePullRequest(upstreamPR.number);
					await this.services.github.branch.deleteBranch(branchName);
				} else {
					this.logger.debug(
						{
							filename: file.filename,
							prNumber: upstreamPR.number,
							mergeableState: prStatus.mergeableState,
						},
						"PR exists with no conflicts, reusing existing branch",
					);
					return existingBranch.data;
				}
			} else {
				const isBehind = await this.services.github.repository.isBranchBehind(
					branchName,
					actualBaseBranch,
					"fork",
				);

				if (isBehind) {
					this.logger.info(
						{ filename: file.filename, branchName },
						"Branch is behind base, deleting and recreating",
					);
					await this.services.github.branch.deleteBranch(branchName);
				} else {
					this.logger.debug(
						{ filename: file.filename, branchName },
						"Branch exists without PR and is up-to-date, reusing",
					);
					return existingBranch.data;
				}
			}
		}

		this.logger.debug({ filename: file.filename, branchName }, "Creating new translation branch");
		const newBranch = await this.services.github.branch.createBranch(branchName, actualBaseBranch);

		return newBranch.data;
	}

	/**
	 * Handles pull request creation or reuse for a translation file.
	 *
	 * Implements intelligent PR lifecycle management by checking if a PR already exists for
	 * the translation branch and evaluating its merge status. PRs are only closed and recreated
	 * when they have true conflicts. PRs that are merely behind the base branch are preserved
	 * since they can be safely rebased without closure.
	 *
	 * ### PR Handling Logic
	 *
	 * 1. **No existing PR**: Creates new PR with provided metadata
	 * 2. **Existing PR without conflicts**: Returns existing PR (preserves PR number and discussion)
	 * 3. **Existing PR with conflicts**: Closes conflicted PR, creates new PR with updated content
	 *
	 * @param file Translation file being processed
	 * @param processingResult Processing metadata including translation and timing
	 *
	 * @returns Either the newly created PR data or the existing PR data if reused
	 */
	private async createOrUpdatePullRequest(
		file: TranslationFile,
		processingResult: ProcessedFileResult,
	) {
		const branchName = `translate/${file.path.split("/").slice(2).join("/")}`;
		const languageName = this.services.languageDetector.getLanguageName(
			LanguageDetectorService.languages.target,
		);
		const prOptions = {
			title: this.services.locale.definitions.pullRequest.title(file),
			body: this.createPullRequestDescription(file, processingResult, languageName),
			baseBranch: "main",
		};

		this.logger.info({ branchName, title: prOptions.title }, "Creating or updating pull request");

		const existingPR = await this.services.github.content.findPullRequestByBranch(branchName);

		if (existingPR) {
			const prStatus = await this.services.github.content.checkPullRequestStatus(existingPR.number);

			if (prStatus.needsUpdate) {
				this.logger.info(
					{ prNumber: existingPR.number, mergeableState: prStatus.mergeableState },
					"Closing PR with merge conflicts and creating new one",
				);

				await this.services.github.content.createCommentOnPullRequest(
					existingPR.number,
					"This PR has merge conflicts and is being closed. A new PR with the updated translation will be created.",
				);

				await this.services.github.content.closePullRequest(existingPR.number);

				return await this.services.github.content.createPullRequest({
					branch: branchName,
					...prOptions,
				});
			}

			this.logger.info(
				{ prNumber: existingPR.number, mergeableState: prStatus.mergeableState },
				"PR exists with no conflicts, reusing",
			);

			return existingPR;
		}

		return await this.services.github.content.createPullRequest({
			branch: branchName,
			...prOptions,
		});
	}

	/**
	 * Creates a comprehensive pull request description for translated content.
	 *
	 * Generates a detailed PR body including translation metadata, review guidelines,
	 * processing statistics, and optional conflict notices. When a file has an existing
	 * invalid PR (with merge conflicts), includes a GitHub Flavored Markdown note to
	 * inform maintainers about the duplicate PR situation.
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
		};
		const generatedPullRequestDescription = this.services.locale.definitions.pullRequest.body(
			file,
			processingResult,
			pullRequestDescriptionMetadata,
		);

		this.logger.info(
			pullRequestDescriptionMetadata,
			"Pull request description created successfully",
		);

		return generatedPullRequestDescription;
	}
}
