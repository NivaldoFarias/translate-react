import langs from "langs";
import ora from "ora";

import type { FileProcessingProgress, ProcessedFileResult, Snapshot } from "@/types";
import type { Environment } from "@/utils/";
import type { SetNonNullable } from "type-fest";

import {
	createErrorHandlingProxy,
	ErrorHandler,
	extractErrorMessage,
	InitializationError,
	ResourceLoadError,
} from "@/errors/";
import { GitHubService } from "@/services/github/github.service";
import { SnapshotService } from "@/services/snapshot.service";
import { TranslatorService } from "@/services/translator.service";
import { setupSignalHandlers, validateEnv } from "@/utils/";
import { TranslationFile } from "@/utils/translation-file.util";

export interface RunnerOptions {
	targetLanguage: string;
	sourceLanguage: string;
	batchSize: number;
}

export abstract class RunnerService {
	protected readonly env: Environment;
	private readonly errorHandler = ErrorHandler.getInstance();

	/**
	 * Tracks progress for the current batch of files being processed
	 * Used to update the spinner and generate statistics
	 */
	protected batchProgress = {
		completed: 0,
		successful: 0,
		failed: 0,
	};

	/**
	 * Maintains the current state of the translation workflow
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
	 * Ensures graceful shutdown and cleanup of resources
	 */
	protected cleanup = () => {
		this.spinner?.stop();

		setTimeout(() => void process.exit(0), 1000);
	};

	/**
	 * Initializes the runner with environment validation and signal handlers
	 * Sets up process event listeners for graceful termination
	 */
	constructor(protected readonly options: RunnerOptions) {
		this.env = validateEnv();

		this.services = {
			github: createErrorHandlingProxy(new GitHubService(), {
				serviceName: "GitHubService",
				excludeMethods: ["getSpinner"],
			}),
			translator: createErrorHandlingProxy(
				new TranslatorService({
					source: this.options.sourceLanguage,
					target: this.options.targetLanguage,
				}),
				{ serviceName: "TranslatorService" },
			),
			snapshot: createErrorHandlingProxy(new SnapshotService(), {
				serviceName: "SnapshotService",
			}),
		};

		if (this.env.FORCE_SNAPSHOT_CLEAR) {
			this.services.snapshot.clear();
		}

		setupSignalHandlers(this.cleanup);
	}

	/**
	 * Verifies GitHub token permissions
	 *
	 * @throws {InitializationError} If token permissions verification fails
	 */
	protected async verifyPermissions() {
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
	protected async syncFork() {
		this.spinner.text = "Checking fork status...";

		const isForkSynced = await this.services.github.isForkSynced();

		if (!isForkSynced) {
			this.spinner.text = "Fork is out of sync. Updating fork...";

			if (this.env.NODE_ENV === "development") {
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
	protected async loadSnapshot(isForkSynced: boolean) {
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
	protected async fetchRepositoryTree() {
		if (!this.state.repositoryTree?.length) {
			this.spinner.text = "Fetching repository content...";
			const repositoryTree = await this.services.github.getRepositoryTree("main");

			this.spinner.text = "Filtering out files that already have a mergeable PR...";

			const filesToFilter = await this.services.github.listFilesToFilter();

			this.state.repositoryTree = repositoryTree.filter(
				(file) => !filesToFilter.includes(file.path?.split("/").pop() || ""),
			);

			if (this.env.NODE_ENV === "development") {
				await this.services.snapshot.append("repositoryTree", repositoryTree);
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
	protected async fetchFilesToTranslate() {
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

		this.state.filesToTranslate = uncheckedFiles.filter(
			(file) => !this.services.translator.isFileTranslated(file),
		);

		if (this.env.NODE_ENV === "development") {
			await this.services.snapshot.append("filesToTranslate", this.state.filesToTranslate);
		}

		this.spinner.succeed(`Found ${this.state.filesToTranslate.length} files to translate`);

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
	protected async fetchBatch(batch: typeof this.state.repositoryTree, updateSpinnerFn: () => void) {
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
	protected async updateIssueWithResults() {
		this.spinner.text = "Commenting on issue...";

		const comment = await this.services.github.commentCompiledResultsOnIssue(
			this.state.processedResults,
			this.state.filesToTranslate,
		);

		this.spinner.succeed(`Commented on translation issue. Comment URL: ${comment.html_url}`);
	}

	/**
	 * @returns `true` if the issue comment should be updated, `false` otherwise
	 */
	protected get shouldUpdateIssueComment() {
		return !!(
			this.env.NODE_ENV === "production" &&
			this.env.PROGRESS_ISSUE_NUMBER &&
			this.metadata.results.size > 0
		);
	}

	/**
	 * Generates and displays final statistics for the translation workflow
	 *
	 * ## Statistics Reported
	 * - Total files processed
	 * - Success/failure counts
	 * - Detailed error information for failed files
	 * - Total execution time
	 *
	 * The statistics are displayed using a combination of:
	 * - Console tables for summary data
	 * - Itemized lists for failures
	 * - Timing information
	 */
	protected async printFinalStatistics() {
		const elapsedTime = Math.ceil(Date.now() - this.metadata.timestamp);
		const results = Array.from(this.metadata.results.values());

		this.spinner.stopAndPersist({ symbol: "📊", text: "Final Statistics" });

		console.table({
			"Files processed successfully": results.filter(({ error }) => !error).length,
			"Failed translations": results.filter(({ error }) => !!error).length,
			"Total elapsed time": this.formatElapsedTime(elapsedTime),
		});

		const failedFiles = results.filter(({ error }) => !!error) as SetNonNullable<
			ProcessedFileResult,
			"error"
		>[];

		if (failedFiles.length > 0) {
			this.spinner.stopAndPersist({
				symbol: "❌",
				text: `Failed translations (${failedFiles.length} total):`,
			});

			for (const [index, { filename, error }] of failedFiles.entries()) {
				this.spinner.stopAndPersist({
					symbol: "  •",
					text: `${index + 1}. ${filename}: ${error.message}`,
				});
			}
		}

		this.spinner.stopAndPersist({
			symbol: "⏱️",
			text: ` Workflow completed in ${elapsedTime}ms (${Math.ceil(elapsedTime / 1000)}s)`,
		});
	}

	/**
	 * Formats a time duration in milliseconds to a human-readable string
	 * using the Intl.RelativeTimeFormat API for localization
	 *
	 * @param elapsedTime The elapsed time in milliseconds
	 *
	 * @returns A formatted duration string
	 */
	private formatElapsedTime(elapsedTime: number) {
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
	 * ## Workflow
	 * 1. Splits files into manageable batches
	 * 2. Processes each batch concurrently
	 * 3. Updates progress in real-time
	 * 4. Reports batch completion statistics
	 *
	 * @param files List of files to process
	 * @param batchSize Number of files to process simultaneously
	 * @throws {ResourceLoadError} If file content cannot be loaded
	 * @throws {APIError} If GitHub operations fail
	 */
	protected async processInBatches(files: TranslationFile[], batchSize = 10) {
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
	) {
		this.batchProgress.completed = 0;
		this.batchProgress.successful = 0;
		this.batchProgress.failed = 0;

		this.spinner.text = `Processing batch ${batchInfo.currentBatch}/${batchInfo.totalBatches}`;
		this.spinner.suffixText = `:: 0 out of ${batch.length} files completed (0% done)`;

		const processBatchFiles = this.errorHandler.wrapAsync(
			async () => {
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
			},
			{ operation: "processBatch", metadata: batchInfo },
		);

		await processBatchFiles();

		const successRate = Math.round((this.batchProgress.successful / batch.length) * 100);

		this.spinner.succeed(
			`Completed batch ${batchInfo.currentBatch}/${batchInfo.totalBatches} :: ` +
				`${this.batchProgress.successful}/${batch.length} successful (${successRate}% success rate)`,
		);

		if (batchInfo.currentBatch < batchInfo.totalBatches) {
			this.spinner.start();
		}
	}

	/**
	 * Processes a single file through the complete translation workflow
	 *
	 * ## Workflow Steps
	 * 1. Creates or gets a translation branch
	 * 2. Translates the file content
	 * 3. Commits the translation
	 * 4. Creates a pull request
	 *
	 * ## Error Handling
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
	private async processFile(file: TranslationFile, progress: FileProcessingProgress) {
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

			const language = langs.where("1", this.options.targetLanguage);

			await this.services.github.commitTranslation({
				branch: metadata.branch,
				file,
				content: metadata.translation,
				message: `Translate \`${file.filename}\` to ${language?.name || "Portuguese"}`,
			});

			metadata.pullRequest = await this.services.github.createPullRequest({
				branch: metadata.branch.ref,
				title: `Translate \`${file.filename}\` to ${language?.name || "Portuguese"}`,
				body: this.pullRequestDescription,
			});

			this.updateBatchProgress("success");
		} catch (error) {
			metadata.error = error instanceof Error ? error : new Error(String(error));
			this.updateBatchProgress("error");
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
	private updateProgressSpinner(progress: FileProcessingProgress) {
		const percentComplete = Math.round((this.batchProgress.completed / progress.batchSize) * 100);

		this.spinner.suffixText = `[${this.batchProgress.completed}/${progress.batchSize}] files completed (${percentComplete}% done)`;
	}

	/**
	 * Updates progress tracking for the current batch and adjusts success/failure counts
	 * This information is used for both real-time feedback and final statistics
	 *
	 * @param status The processing outcome for the file
	 */
	private updateBatchProgress(status: "success" | "error") {
		this.batchProgress.completed++;
		status === "success" ? this.batchProgress.successful++ : this.batchProgress.failed++;
	}

	abstract run(): Promise<void>;

	protected get pullRequestDescription() {
		const language = langs.where("1", this.options.targetLanguage);

		return `This pull request contains a translation of the referenced page to ${language?.name || "Portuguese"}. The translation was generated using LLMs _(Open Router API :: model \`${this.env.LLM_MODEL}\`)_.

Refer to the [source repository](https://github.com/${this.env.REPO_FORK_OWNER}/translate-react) workflow that generated this translation for more details.

Feel free to review and suggest any improvements to the translation.`;
	}
}
