import ora from "ora";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { SetNonNullable } from "type-fest";

import type { ReactLanguageCode } from "@/utils/constants.util";

import { InitializationError, ResourceLoadError } from "@/errors/";
import { GitHubService } from "@/services/github/github.service";
import { Snapshot, SnapshotService } from "@/services/snapshot.service";
import { TranslationFile, TranslatorService } from "@/services/translator.service";
import { env, logger, RuntimeEnvironment, setupSignalHandlers } from "@/utils/";

import { homepage, name, version } from "../../../package.json";

export interface RunnerOptions {
	targetLanguage: ReactLanguageCode;
	sourceLanguage: ReactLanguageCode;
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

export abstract class RunnerService {
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
	protected state: Omit<Snapshot, "id"> = {
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

	/** Progress spinner for CLI feedback */
	protected spinner = ora({
		text: "Starting translation workflow",
		color: "cyan",
		spinner: "dots",
	});

	/**
	 * Cleanup handler for process termination.
	 *
	 * Ensures graceful shutdown and cleanup of resources
	 */
	protected cleanup = () => {
		this.spinner?.stop();

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
			github: new GitHubService({
				upstream: { owner: env.REPO_UPSTREAM_OWNER, repo: env.REPO_UPSTREAM_NAME },
				fork: { owner: env.REPO_FORK_OWNER, repo: env.REPO_FORK_NAME },
			}),
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
		this.spinner.text = "Checking fork status...";

		const isForkSynced = await this.services.github.isForkSynced();

		if (!isForkSynced) {
			this.spinner.text = "Fork is out of sync. Updating fork...";

			if (env.NODE_ENV === "development") {
				await this.services.snapshot.clear();
			}

			const syncSuccess = await this.services.github.syncFork();
			if (!syncSuccess) {
				throw new InitializationError("Failed to sync fork with upstream repository", {
					operation: "syncFork",
				});
			}

			this.spinner.succeed("Fork synchronized with upstream repository");
		} else {
			this.spinner.succeed("Fork is up to date");
		}

		this.spinner.start();

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
			this.spinner.stopAndPersist({
				symbol: "📦",
				text: "Snapshot loaded",
			});

			this.state = latestSnapshot;

			this.spinner.start();
		}
	}

	/**
	 * Fetches the repository tree and glossary
	 *
	 * @throws {ResourceLoadError} If the repository tree or glossary fetch fails
	 */
	protected async fetchRepositoryTree(): Promise<void> {
		if (!this.state.repositoryTree?.length) {
			this.spinner.text = "Fetching repository content...";
			this.state.repositoryTree = await this.services.github.getRepositoryTree();

			if (env.NODE_ENV === "development") {
				await this.services.snapshot.append("repositoryTree", this.state.repositoryTree);
			}

			this.spinner.text = "Repository tree fetched. Fetching glossary...";
			const glossary = await this.services.github.getGlossary();

			if (!glossary) {
				throw new ResourceLoadError("Failed to fetch glossary", { operation: "fetchGlossary" });
			}

			this.services.translator.glossary = glossary;
			this.spinner.succeed("Repository content fetched");
		} else {
			this.spinner.stopAndPersist({
				symbol: "📦",
				text: "Repository tree already fetched",
			});
		}

		this.spinner.start();
	}

	/**
	 * Fetches and filters files that need translation
	 *
	 * @throws {ResourceLoadError} If file content fetch fails
	 */
	protected async fetchFilesToTranslate(): Promise<void> {
		if (this.state.filesToTranslate.length) {
			this.spinner.stopAndPersist({
				symbol: "📦",
				text: `Found ${this.state.filesToTranslate.length} files to translate`,
			});

			this.spinner.start();

			return;
		}

		this.spinner.text = "Fetching files...";

		const uncheckedFiles: TranslationFile[] = [];
		const totalFiles = this.state.repositoryTree.length;
		let completedFiles = 0;

		const updateSpinner = () => {
			completedFiles++;
			const percentage = Math.floor((completedFiles / totalFiles) * 100);
			this.spinner.text = `Fetching files: ${completedFiles}/${totalFiles} (${percentage}%)`;
		};

		const uniqueFiles = this.state.repositoryTree.filter(
			(file, index, self) => index === self.findIndex((f) => f.path === file.path),
		);

		const batchSize = 10;

		for (let i = 0; i < uniqueFiles.length; i += batchSize) {
			const batch = uniqueFiles.slice(i, i + batchSize);
			const batchResults = await this.fetchBatch(batch, updateSpinner);

			uncheckedFiles.push(
				...batchResults.filter((file): file is NonNullable<typeof file> => !!file),
			);
		}

		let numFilesFiltered = 0;

		this.state.filesToTranslate = [];
		for (const file of uncheckedFiles) {
			const analysis = await this.services.translator.languageDetector.analyzeLanguage(
				file.filename,
				file.content,
			);

			if (analysis.isTranslated) numFilesFiltered++;
			else this.state.filesToTranslate.push(file);
		}

		if (env.NODE_ENV === RuntimeEnvironment.Development) {
			await this.services.snapshot.append("filesToTranslate", this.state.filesToTranslate);
		}

		this.spinner.succeed(
			`Found ${this.state.filesToTranslate.length} files to translate (${numFilesFiltered} already translated)`,
		);

		this.spinner.start();
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
	 * Updates the issue with translation results
	 *
	 * @throws {APIError} If commenting on the issue fails
	 */
	protected async updateIssueWithResults(): Promise<void> {
		this.spinner.text = "Commenting on issue...";

		const comment = await this.services.github.commentCompiledResultsOnIssue(
			this.state.processedResults,
			this.state.filesToTranslate,
		);

		this.spinner.succeed(`Commented on translation issue. Comment URL: ${comment.html_url}`);
	}

	/**
	 * Determines if the issue comment should be updated based on environment and results
	 *
	 * @returns `true` if the issue comment should be updated, `false` otherwise
	 */
	protected get shouldUpdateIssueComment(): boolean {
		return !!(
			env.NODE_ENV === "production" &&
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

		this.spinner.stopAndPersist({
			symbol: "📊",
			text: `Final: ${successCount} successful, ${failureCount} failed (${this.formatElapsedTime(elapsedTime)})`,
		});

		const failedFiles = results.filter(({ error }) => !!error) as SetNonNullable<
			ProcessedFileResult,
			"error"
		>[];

		if (failedFiles.length > 0) {
			this.spinner.stopAndPersist({
				symbol: "❌",
				text: `Failed files (${failedFiles.length}):`,
			});

			for (const [index, { filename, error }] of failedFiles.entries()) {
				this.spinner.stopAndPersist({
					symbol: "  •",
					text: `${index + 1}. ${filename}: ${error.message}`,
				});
			}
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
	 * @throws {APIError} If GitHub operations fail
	 */
	protected async processInBatches(files: TranslationFile[], batchSize = 10): Promise<void> {
		this.spinner.text = "Processing files";

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

		this.spinner.text = `Processing batch ${batchInfo.currentBatch}/${batchInfo.totalBatches}`;
		this.spinner.suffixText = `(0/${batch.length})`;

		try {
			logger.info(
				{
					currentBatch: batchInfo.currentBatch,
					totalBatches: batchInfo.totalBatches,
					batchSize: batch.length,
				},
				"Processing batch",
			);

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
				{
					batchIndex: batchInfo.currentBatch,
					successful: this.batchProgress.successful,
					failed: this.batchProgress.failed,
				},
				"Batch processing completed",
			);
		} catch (error) {
			logger.error({ error, batchInfo }, "Error processing batch");
			throw error;
		}

		const successRate = Math.round((this.batchProgress.successful / batch.length) * 100);

		this.spinner.succeed(
			`Batch ${batchInfo.currentBatch}/${batchInfo.totalBatches} completed: ${this.batchProgress.successful}/${batch.length} successful (${successRate}%)`,
		);

		if (batchInfo.currentBatch < batchInfo.totalBatches) {
			this.spinner.start();
		}
	}

	/**
	 * Processes a single file through the complete translation workflow
	 *
	 * ### Workflow Steps
	 *
	 * 1. Creates or gets a translation branch
	 * 2. Translates the file content
	 * 3. Commits the translation
	 * 4. Creates a pull request
	 *
	 * ### Error Handling
	 *
	 * - Captures and logs all errors
	 * - Updates progress tracking
	 * - Maintains file metadata even on failure
	 *
	 * @param file File to process
	 * @param progress Progress tracking information
	 *
	 * @throws {APIError} If GitHub operations fail
	 * @throws {ResourceLoadError} If translation resources cannot be loaded
	 */
	private async processFile(
		file: TranslationFile,
		progress: FileProcessingProgress,
	): Promise<void> {
		const metadata = this.metadata.results.get(file.filename) || {
			branch: null,
			filename: file.filename,
			translation: null,
			pullRequest: null,
			error: null,
		};

		try {
			metadata.branch = await this.services.github.createOrGetTranslationBranch(file);
			metadata.translation = await this.services.translator.translateContent(file);

			const languageName =
				this.services.translator.languageDetector.getLanguageName(this.options.targetLanguage) ||
				"Portuguese";

			await this.services.github.commitTranslation({
				branch: metadata.branch,
				file,
				content: metadata.translation,
				message: `Translate \`${file.filename}\` to ${languageName}`,
			});

			metadata.pullRequest = await this.services.github.createOrUpdatePullRequest(file, {
				title: `Translate \`${file.filename}\` to ${languageName}`,
				body: this.createPullRequestDescription(file, metadata),
			});

			this.updateBatchProgress("success");
		} catch (error) {
			metadata.error = error instanceof Error ? error : new Error(String(error));
			this.updateBatchProgress("error");

			await this.cleanupFailedTranslation(metadata);
		} finally {
			this.metadata.results.set(file.filename, metadata);
			this.updateProgressSpinner(progress);
		}
	}

	/**
	 * Updates the spinner with current progress information
	 *
	 * @param progress Current progress information
	 */
	private updateProgressSpinner(progress: FileProcessingProgress): void {
		this.spinner.suffixText = `(${this.batchProgress.completed}/${progress.batchSize})`;
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
		if (metadata.branch?.ref) {
			try {
				const branchName = metadata.branch.ref.replace("refs/heads/", "");
				await this.services.github.cleanupBranch(branchName);
				logger.info(
					{ branchName, filename: metadata.filename },
					"Cleaned up branch after failed translation",
				);
			} catch (cleanupError) {
				logger.error(
					{
						error: cleanupError,
						filename: metadata.filename,
						branchRef: metadata.branch.ref,
					},
					"Failed to cleanup branch after translation failure - non-critical",
				);
			}
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
