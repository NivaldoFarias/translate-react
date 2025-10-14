import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { SetNonNullable } from "type-fest";

import type { ReactLanguageCode } from "@/utils/constants.util";

import { InitializationError, ResourceLoadError } from "@/errors/";
import { GitHubService } from "@/services/github/github.service";
import { Snapshot, SnapshotService } from "@/services/snapshot.service";
import { TranslationFile, TranslatorService } from "@/services/translator.service";
import {
	env,
	FILE_FETCH_BATCH_SIZE,
	logger,
	MAX_FILE_SIZE,
	RuntimeEnvironment,
	setupSignalHandlers,
} from "@/utils/";

import { homepage, name, version } from "../../../package.json";

export interface RunnerOptions {
	/** The target language code for translation */
	targetLanguage: ReactLanguageCode;

	/** The source language code for translation */
	sourceLanguage: ReactLanguageCode;

	/** The number of files to process in each batch */
	batchSize: number;
}

/** Represents the progress of file processing in batches */
export interface FileProcessingProgress {
	/** The index of the current batch */
	batchIndex: number;

	/** The index of the current file in the batch */
	fileIndex: number;

	/** The total number of batches */
	totalBatches: number;

	/** The number of files to process in each batch */
	batchSize: number;
}

export interface ProcessedFileResult {
	branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"] | null;
	filename: string;
	translation: string | null;
	pullRequest:
		| RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]
		| RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
		| null;
	error: Error | null;
}

export type RunnerState = Omit<Snapshot, "id">;

export abstract class BaseRunnerService {
	/**
	 * Tracks progress for the current batch of files being processed
	 *
	 * Used to update the spinner and generate statistics
	 */
	protected batchProgress = {
		completed: 0,
		successful: 0,
		failed: 0,
	};

	/**
	 * Maintains the current state of the translation workflow.
	 *
	 * In development mode, this state can be persisted between runs
	 */
	protected state: RunnerState = {
		repositoryTree: [],
		filesToTranslate: [],
		processedResults: [],
		timestamp: Date.now(),
	};

	protected readonly services: {
		/** GitHub service instance for repository operations */
		github: GitHubService;

		/** Translation service for content translation operations */
		translator: TranslatorService;

		/** Snapshot manager to persist and retrieve workflow state */
		snapshot: SnapshotService;
	};

	/** Statistics tracking for the translation process */
	protected metadata = {
		results: new Map<ProcessedFileResult["filename"], ProcessedFileResult>(),
		timestamp: Date.now(),
	};

	/**
	 * Cleanup handler for process termination.
	 *
	 * Ensures graceful shutdown and cleanup of resources
	 */
	protected cleanup = () => {
		logger.info("Shutting down gracefully...");

		setTimeout(() => void process.exit(0), 1000);
	};

	/**
	 * Initializes the runner with environment validation and signal handlers
	 *
	 * Sets up process event listeners for graceful termination
	 */
	constructor(
		protected readonly options: RunnerOptions = {
			targetLanguage: env.TARGET_LANGUAGE,
			sourceLanguage: "en",
			batchSize: env.BATCH_SIZE,
		},
	) {
		this.services = {
			github: new GitHubService(),
			translator: new TranslatorService({
				source: this.options.sourceLanguage,
				target: this.options.targetLanguage,
			}),
			snapshot: new SnapshotService(),
		};

		if (env.FORCE_SNAPSHOT_CLEAR) {
			this.services.snapshot.clear();
		}

		setupSignalHandlers(this.cleanup, (message, error) => {
			logger.error({ error, message }, "Signal handler triggered during cleanup");
		});
	}

	/**
	 * Verifies GitHub token permissions
	 *
	 * @throws {InitializationError} If token permissions verification fails
	 */
	protected async verifyPermissions(): Promise<void> {
		const hasPermissions = await this.services.github.verifyTokenPermissions();

		if (!hasPermissions) {
			throw new InitializationError("Token permissions verification failed", {
				operation: "verifyTokenPermissions",
			});
		}
	}

	/**
	 * Synchronizes the fork with the upstream repository
	 *
	 * @throws {InitializationError} If the fork synchronization fails
	 *
	 * @returns `true` if the fork is up to date, `false` otherwise
	 */
	protected async syncFork(): Promise<boolean> {
		logger.info("Checking fork status...");

		const isForkSynced = await this.services.github.isForkSynced();

		if (!isForkSynced) {
			logger.info("Fork is out of sync, updating fork...");

			if (env.NODE_ENV === RuntimeEnvironment.Development) {
				await this.services.snapshot.clear();
			}

			const syncSuccess = await this.services.github.syncFork();
			if (!syncSuccess) {
				throw new InitializationError("Failed to sync fork with upstream repository", {
					operation: "syncFork",
				});
			}

			logger.info("Fork synchronized with upstream repository");
		} else {
			logger.info("Fork is up to date");
		}

		return isForkSynced;
	}

	/**
	 * Loads the latest snapshot from the snapshot service
	 *
	 * @param isForkSynced Whether the fork is up to date
	 */
	protected async loadSnapshot(isForkSynced: boolean): Promise<void> {
		const latestSnapshot = await this.services.snapshot.loadLatest();

		if (latestSnapshot && !isForkSynced) {
			logger.info("Snapshot loaded from previous session");

			this.state = latestSnapshot;
		}
	}

	/**
	 * Fetches the repository tree and glossary
	 *
	 * @throws {ResourceLoadError} If the repository tree or glossary fetch fails
	 */
	protected async fetchRepositoryTree(): Promise<void> {
		if (!this.state.repositoryTree?.length) {
			logger.info("Fetching repository content...");
			this.state.repositoryTree = await this.services.github.getRepositoryTree();

			if (env.NODE_ENV === RuntimeEnvironment.Development) {
				await this.services.snapshot.append("repositoryTree", this.state.repositoryTree);
			}

			logger.info("Repository tree fetched, fetching glossary...");
			const glossary = await this.services.github.getGlossary();

			if (!glossary) {
				throw new ResourceLoadError("Failed to fetch glossary", { operation: "fetchGlossary" });
			}

			this.services.translator.glossary = glossary;
			logger.info("Repository content fetched successfully");
		} else {
			logger.info("Repository tree already fetched (from snapshot)");
		}
	}

	/**
	 * Fetches and filters files that need translation.
	 *
	 * Performs a multi-stage filtering process:
	 * 1. Fetches file content from repository in batches
	 * 2. Filters files with existing open pull requests
	 * 3. Filters files exceeding size limits
	 * 4. Filters files already translated via language detection
	 *
	 * @throws {ResourceLoadError} If file content fetch fails
	 */
	protected async fetchFilesToTranslate(): Promise<void> {
		if (this.state.filesToTranslate.length) {
			logger.info(`Found ${this.state.filesToTranslate.length} files to translate (from snapshot)`);

			return;
		}

		logger.info("Fetching files...");

		const uncheckedFiles: TranslationFile[] = [];
		const totalFiles = this.state.repositoryTree.length;
		let completedFiles = 0;

		const updateProgress = () => {
			completedFiles++;
			const percentage = Math.floor((completedFiles / totalFiles) * 100);
			if (completedFiles % 10 === 0 || completedFiles === totalFiles) {
				logger.info(`Fetching files: ${completedFiles}/${totalFiles} (${percentage}%)`);
			}
		};

		const uniqueFiles = this.state.repositoryTree.filter(
			(file, index, self) => index === self.findIndex((f) => f.path === file.path),
		);

		for (let i = 0; i < uniqueFiles.length; i += FILE_FETCH_BATCH_SIZE) {
			const batch = uniqueFiles.slice(i, i + FILE_FETCH_BATCH_SIZE);
			const batchResults = await this.fetchBatch(batch, updateProgress);

			uncheckedFiles.push(
				...batchResults.filter((file): file is NonNullable<typeof file> => !!file),
			);
		}

		let numFilesFiltered = 0;
		let numFilesWithPRs = 0;
		let numFilesTooLarge = 0;

		logger.info("Checking for existing open PRs...");
		const openPRs = await this.services.github.listOpenPullRequests();
		const prFileMap = new Map<string, number>();

		for (const pr of openPRs) {
			const match = pr.title?.match(/Translate `(.+?)` to/);
			if (match && match[1]) {
				prFileMap.set(match[1], pr.number);
			}
		}

		logger.debug(
			{ openPRCount: openPRs.length, mappedFiles: prFileMap.size },
			"Open PRs mapped to filenames",
		);

		this.state.filesToTranslate = [];
		for (const file of uncheckedFiles) {
			if (prFileMap.has(file.filename)) {
				numFilesWithPRs++;
				logger.debug(
					{ filename: file.filename, prNumber: prFileMap.get(file.filename) },
					"Skipping file with existing PR",
				);
				continue;
			}

			if (file.content.length > MAX_FILE_SIZE) {
				numFilesTooLarge++;
				logger.warn(
					{
						filename: file.filename,
						size: file.content.length,
						maxSize: MAX_FILE_SIZE,
					},
					"Skipping file: exceeds maximum size limit",
				);
				continue;
			}

			const analysis = await this.services.translator.languageDetector.analyzeLanguage(
				file.filename,
				file.content,
			);

			if (analysis.isTranslated) {
				numFilesFiltered++;
			} else {
				this.state.filesToTranslate.push(file);
			}
		}

		if (env.NODE_ENV === RuntimeEnvironment.Development) {
			await this.services.snapshot.append("filesToTranslate", this.state.filesToTranslate);
		}

		logger.info(
			{
				filesToTranslate: this.state.filesToTranslate.length,
				alreadyTranslated: numFilesFiltered,
				withExistingPRs: numFilesWithPRs,
				tooLarge: numFilesTooLarge,
				totalFiltered: numFilesFiltered + numFilesWithPRs + numFilesTooLarge,
			},
			`Found ${this.state.filesToTranslate.length} files to translate (${numFilesFiltered + numFilesWithPRs + numFilesTooLarge} filtered)`,
		);
	}

	/**
	 * Fetches a batch of files and updates the spinner
	 *
	 * @param batch The batch of files to fetch
	 * @param updateSpinnerFn The function to update the spinner
	 *
	 * @returns The batch of files
	 */
	protected async fetchBatch(
		batch: typeof this.state.repositoryTree,
		updateSpinnerFn: () => void,
	): Promise<(TranslationFile | null)[]> {
		return await Promise.all(
			batch.map(async (file) => {
				const filename = file.path?.split("/").pop();

				if (!filename || !file.sha || !file.path) return null;

				const content = await this.services.github.getFileContent(file);

				updateSpinnerFn();

				return new TranslationFile(content, filename, file.path, file.sha);
			}),
		);
	}

	/**
	 * Updates the progress issue with the translation results
	 *
	 * @throws {APIError} If commenting on the issue fails
	 */
	protected async updateIssueWithResults(): Promise<void> {
		logger.info("Commenting on issue...");

		const comment = await this.services.github.commentCompiledResultsOnIssue(
			this.state.processedResults,
			this.state.filesToTranslate,
		);

		logger.info({ commentUrl: comment.html_url }, "Commented on translation issue");
	}

	/**
	 * Determines if the issue comment should be updated based on environment and results
	 *
	 * @returns `true` if the issue comment should be updated, `false` otherwise
	 */
	protected get shouldUpdateIssueComment(): boolean {
		return !!(
			env.NODE_ENV === RuntimeEnvironment.Production &&
			env.PROGRESS_ISSUE_NUMBER &&
			this.metadata.results.size > 0
		);
	}

	/**
	 * Generates and displays final statistics for the translation workflow
	 *
	 * The statistics are displayed using a combination of:
	 * - Console tables for summary data
	 * - Itemized lists for failures
	 * - Timing information
	 *
	 * ### Statistics Reported
	 *
	 * - Total files processed
	 * - Success/failure counts
	 * - Detailed error information for failed files
	 * - Total execution time
	 */
	protected async printFinalStatistics(): Promise<void> {
		const elapsedTime = Math.ceil(Date.now() - this.metadata.timestamp);
		const results = Array.from(this.metadata.results.values());

		const successCount = results.filter(({ error }) => !error).length;
		const failureCount = results.filter(({ error }) => !!error).length;

		logger.info(
			{ successCount, failureCount, elapsedTime: this.formatElapsedTime(elapsedTime) },
			"Final statistics",
		);

		const failedFiles = results.filter(({ error }) => !!error) as SetNonNullable<
			ProcessedFileResult,
			"error"
		>[];

		if (failedFiles.length > 0) {
			logger.warn(
				{
					failures: failedFiles.map(({ filename, error }) => ({ filename, error: error.message })),
				},
				`Failed files (${failedFiles.length})`,
			);
		}
	}

	/**
	 * Formats a byte count to a human-readable string with appropriate units
	 *
	 * @param bytes The number of bytes to format
	 *
	 * @returns A formatted string with units (B, KB, MB, etc.)
	 */
	private formatBytes(bytes: number): string {
		if (bytes === 0) return "0 B";

		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
	}

	/**
	 * Formats a time duration in milliseconds to a human-readable string
	 * using the {@link Intl.RelativeTimeFormat} API for localization
	 *
	 * @param elapsedTime The elapsed time in milliseconds
	 *
	 * @returns A formatted duration string
	 */
	private formatElapsedTime(elapsedTime: number): string {
		const formatter = new Intl.RelativeTimeFormat("en", { numeric: "always", style: "long" });

		const seconds = Math.floor(elapsedTime / 1000);

		if (seconds < 60) {
			return formatter.format(seconds, "second").replace("in ", "");
		} else if (seconds < 3600) {
			return formatter.format(Math.floor(seconds / 60), "minute").replace("in ", "");
		} else {
			return formatter.format(Math.floor(seconds / 3600), "hour").replace("in ", "");
		}
	}

	/**
	 * Processes files in batches to manage resources and provide progress feedback
	 *
	 * ### Workflow
	 *
	 * 1. Splits files into manageable batches
	 * 2. Processes each batch concurrently
	 * 3. Updates progress in real-time
	 * 4. Reports batch completion statistics
	 *
	 * @param files List of files to process
	 * @param batchSize Number of files to process simultaneously
	 *
	 * @throws {ResourceLoadError} If file content cannot be loaded
	 */
	protected async processInBatches(files: TranslationFile[], batchSize = 10): Promise<void> {
		logger.info("Processing files in batches...");

		const batches = this.createBatches(files, batchSize);

		for (const [batchIndex, batch] of batches.entries()) {
			await this.processBatch(batch, {
				currentBatch: batchIndex + 1,
				totalBatches: batches.length,
				batchSize: batch.length,
			});
		}
	}

	/**
	 * Creates evenly sized batches from a list of files
	 *
	 * @param files Files to split into batches
	 * @param batchSize Maximum size of each batch
	 */
	private createBatches(files: TranslationFile[], batchSize: number): TranslationFile[][] {
		const batches: TranslationFile[][] = [];

		for (let i = 0; i < files.length; i += batchSize) {
			batches.push(files.slice(i, i + batchSize));
		}

		return batches;
	}

	/**
	 * Processes a single batch of files concurrently
	 *
	 * @param batch Files in the current batch
	 * @param batchInfo Information about the batch's position in the overall process
	 */
	private async processBatch(
		batch: TranslationFile[],
		batchInfo: { currentBatch: number; totalBatches: number; batchSize: number },
	): Promise<void> {
		this.batchProgress.completed = 0;
		this.batchProgress.successful = 0;
		this.batchProgress.failed = 0;

		try {
			logger.info(batchInfo, "Processing batch");

			await Promise.all(
				batch.map((file) => {
					const progress = {
						batchIndex: batchInfo.currentBatch,
						fileIndex: this.batchProgress.completed,
						totalBatches: batchInfo.totalBatches,
						batchSize: batchInfo.batchSize,
					};

					return this.processFile(file, progress);
				}),
			);

			logger.info(
				{ batchIndex: batchInfo.currentBatch, ...this.batchProgress },
				"Batch processing completed",
			);
		} catch (error) {
			logger.error({ error, batchInfo }, "Error processing batch");
			throw error;
		}

		const successRate = Math.round((this.batchProgress.successful / batch.length) * 100);

		logger.info(
			{
				batchIndex: batchInfo.currentBatch,
				totalBatches: batchInfo.totalBatches,
				successful: this.batchProgress.successful,
				total: batch.length,
				successRate,
			},
			`Batch ${batchInfo.currentBatch}/${batchInfo.totalBatches} completed: ${this.batchProgress.successful}/${batch.length} successful (${successRate}%)`,
		);
	}

	/**
	 * Processes a single file through the complete translation workflow.
	 *
	 * Handles the entire lifecycle of translating a file sequentially, from branch
	 * creation through translation, commit, and pull request generation. Each step
	 * is performed synchronously using `await` to ensure proper ordering and state
	 * management. Includes comprehensive error handling and cleanup for failed translations.
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
	 * ### Error Handling
	 *
	 * - Captures and logs all errors with timing context
	 * - Updates progress tracking for reporting
	 * - Performs cleanup of created resources (branches) on failure
	 * - Maintains file metadata even on failure for audit trail
	 *
	 * @param file File to process through translation workflow
	 * @param _progress Progress tracking information for batch processing
	 *
	 * @throws {APIError} When GitHub operations fail
	 * @throws {ResourceLoadError} When translation resources cannot be loaded
	 */
	private async processFile(
		file: TranslationFile,
		_progress: FileProcessingProgress,
	): Promise<void> {
		const metadata = this.metadata.results.get(file.filename) || {
			branch: null,
			filename: file.filename,
			translation: null,
			pullRequest: null,
			error: null,
		};

		const fileStartTime = Date.now();

		try {
			logger.debug(
				{ filename: file.filename, contentLength: file.content.length },
				"Starting file processing workflow",
			);

			const branchStartTime = Date.now();
			metadata.branch = await this.services.github.createOrGetTranslationBranch(file);
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

			const languageName =
				this.services.translator.languageDetector.getLanguageName(this.options.targetLanguage) ||
				"Portuguese";

			const commitStartTime = Date.now();
			await this.services.github.commitTranslation({
				file,
				branch: metadata.branch,
				content: metadata.translation,
				message: `Translate \`${file.filename}\` to ${languageName}`,
			});
			const commitDuration = Date.now() - commitStartTime;

			logger.debug(
				{ filename: file.filename, durationMs: commitDuration },
				"Commit completed - creating pull request",
			);

			const prStartTime = Date.now();
			metadata.pullRequest = await this.services.github.createOrUpdatePullRequest(file, {
				title: `Translate \`${file.filename}\` to ${languageName}`,
				body: this.createPullRequestDescription(file, metadata),
			});

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

			this.updateBatchProgress("success");
		} catch (error) {
			const failureDuration = Date.now() - fileStartTime;

			logger.error(
				{ error, filename: file.filename, durationMs: failureDuration },
				"File processing failed",
			);

			metadata.error = error instanceof Error ? error : new Error(String(error));
			this.updateBatchProgress("error");

			await this.cleanupFailedTranslation(metadata);
		} finally {
			this.metadata.results.set(file.filename, metadata);
		}
	}

	/**
	 * Updates progress tracking for the current batch and adjusts success/failure counts.
	 *
	 * This information is used for both real-time feedback and final statistics
	 *
	 * @param status The processing outcome for the file
	 */
	private updateBatchProgress(status: "success" | "error"): void {
		this.batchProgress.completed++;
		status === "success" ? this.batchProgress.successful++ : this.batchProgress.failed++;
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
			await this.services.github.cleanupBranch(branchName);
			logger.info(
				{ branchName, filename: metadata.filename },
				"Cleaned up branch after failed translation",
			);
		} catch (error) {
			logger.error(
				{ error, filename: metadata.filename, branchRef: metadata.branch.ref },
				"Failed to cleanup branch after translation failure - non-critical",
			);
		}
	}

	abstract run(): Promise<void>;

	protected createPullRequestDescription(
		file: TranslationFile,
		processingResult: ProcessedFileResult,
	): string {
		const languageName =
			this.services.translator.languageDetector.getLanguageName(this.options.targetLanguage) ||
			"Portuguese";

		const processingTime = Date.now() - this.metadata.timestamp;
		const sourceLength = file.content.length;
		const translationLength = processingResult.translation?.length || 0;
		const compressionRatio = sourceLength > 0 ? (translationLength / sourceLength).toFixed(2) : "0";

		return `This pull request contains an automated translation of the referenced page to **${languageName}**.

> [!IMPORTANT]
> This translation was generated using AI/LLM and requires human review for accuracy, cultural context, and technical terminology.

## Review Guidelines

Please review this translation for:

- [ ] **Accuracy**: Content meaning preserved from source
- [ ] **Technical Terms**: Proper translation of React/development terminology
- [ ] **Cultural Context**: Appropriate localization for target audience
- [ ] **Formatting**: Markdown syntax and code blocks maintained
- [ ] **Links**: Internal references and external links work correctly

<details>
<summary>Translation Details</summary>

### Processing Statistics

| Metric | Value |
|--------|-------|
| **Source File Size** | ${this.formatBytes(sourceLength)} |
| **Translation Size** | ${this.formatBytes(translationLength)} |
| **Content Ratio** | ${compressionRatio}x |
| **File Path** | \`${file.path}\` |
| **Processing Time** | ~${Math.ceil(processingTime / 1000)}s |

###### ps.: The content ratio indicates how the translation length compares to the source (1.0x = same length, >1.0x = translation is longer). Different languages naturally have varying verbosity levels.

### Technical Information

- **Target Language**: ${languageName} (\`${this.options.targetLanguage}\`)
- **AI Model**: \`${env.LLM_MODEL}\` via Open Router API
- **Generated**: ${new Date().toISOString().split("T")[0]}
- **Branch**: \`${processingResult.branch?.ref || "unknown"}\`
- **Translation Tool Version**: \`${name} v${version}\`


</details>

## Additional Resources

- [Source Repository](${homepage}): Workflow and tooling details
- [Translation Workflow Documentation](${homepage}#readme): Process overview and guidelines

---

**Questions or suggestions?** Feel free to leave comments or request changes to improve the translation quality.`;
	}
}
