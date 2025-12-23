import type {
	CacheCheckResult,
	FileProcessingProgress,
	LanguageDetectionResult,
	PatchedRepositoryItem,
	ProcessedFileResult,
	PrFilterResult as PullRequestFilterResult,
	PullRequestStatus,
	RunnerOptions,
	WorkflowStatistics,
} from "./runner.types";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { SetNonNullable, SetRequired } from "type-fest";

import type { PullRequestOptions } from "@/services/github/";

import { InitializationError, ResourceLoadError } from "@/errors/";
import { LanguageCacheService } from "@/services/cache/";
import { BranchService, ContentService, RepositoryService } from "@/services/github/";
import { TranslationFile, TranslatorService } from "@/services/translator.service";
import {
	env,
	FILE_FETCH_BATCH_SIZE,
	logger,
	MAX_FILE_SIZE,
	MIN_CACHE_CONFIDENCE,
	RuntimeEnvironment,
	setupSignalHandlers,
} from "@/utils/";

import { homepage, name, version } from "../../../package.json";

export interface RunnerState {
	repositoryTree: PatchedRepositoryItem[];
	filesToTranslate: TranslationFile[];
	processedResults: ProcessedFileResult[];
	timestamp: number;

	/**
	 * Map of file paths to invalid PR information.
	 *
	 * Tracks files that have existing PRs with conflicts or unmergeable status.
	 * Used to add informational notes when creating new PRs for these files.
	 */
	invalidPRsByFile?: Map<string, { prNumber: number; status: PullRequestStatus }>;
}

export abstract class BaseRunnerService {
	protected logger = logger.child({ component: BaseRunnerService.name });

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

	protected readonly services = {
		/** GitHub service instance for repository operations */
		github: {
			branch: new BranchService(),
			repository: new RepositoryService(),
			content: new ContentService(),
		},

		/** Translation service for content translation operations */
		translator: new TranslatorService(),

		/** In-memory cache for language detection results */
		languageCache: new LanguageCacheService(),
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
		this.logger.info("Shutting down gracefully");

		setTimeout(() => void process.exit(0), 1000);
	};

	/**
	 * Initializes the runner with environment validation and signal handlers
	 *
	 * Sets up process event listeners for graceful termination
	 */
	constructor(
		protected readonly options: RunnerOptions = {
			batchSize: env.BATCH_SIZE,
		},
	) {
		setupSignalHandlers(this.cleanup, (message, error) => {
			this.logger.error({ error, message }, "Signal handler triggered during cleanup");
		});
	}

	/**
	 * Calls {@link TranslatorService.testConnectivity} to verify LLM connectivity
	 *
	 * @throws {InitializationError} If LLM connectivity test fails
	 */
	protected async verifyLLMConnectivity(): Promise<void> {
		await this.services.translator.testConnectivity();
	}

	/**
	 * Verifies GitHub token permissions
	 *
	 * @throws {InitializationError} If token permissions verification fails
	 */
	protected async verifyPermissions(): Promise<void> {
		const hasPermissions = await this.services.github.repository.verifyTokenPermissions();

		if (!hasPermissions) {
			throw new InitializationError("Token permissions verification failed", {
				operation: `${BaseRunnerService.name}.verifyTokenPermissions`,
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
		this.logger.info("Checking fork existance and its status");

		await this.services.github.repository.forkExists();
		const isForkSynced = await this.services.github.repository.isForkSynced();

		if (!isForkSynced) {
			this.logger.info("Fork is out of sync, updating fork");

			const syncSuccess = await this.services.github.repository.syncFork();
			if (!syncSuccess) {
				throw new InitializationError("Failed to sync fork with upstream repository", {
					operation: `${BaseRunnerService.name}.syncFork`,
				});
			}

			this.logger.info("Fork synchronized with upstream repository");
		} else {
			this.logger.info("Fork is up to date");
		}

		return isForkSynced;
	}

	/**
	 * Fetches the repository tree and glossary
	 *
	 * @throws {ResourceLoadError} If the repository tree or glossary fetch fails
	 */
	protected async fetchRepositoryTree(): Promise<void> {
		this.logger.info("Fetching repository content");
		const repositoryTree = await this.services.github.repository.getRepositoryTree();

		this.state.repositoryTree = repositoryTree.map((item) => {
			const filename = item.path?.split("/").pop() ?? "";

			return { ...item, filename };
		}) as PatchedRepositoryItem[];

		this.logger.info("Repository tree fetched, fetching glossary");
		const glossary = await this.services.github.repository.fetchGlossary();

		if (!glossary) {
			throw new ResourceLoadError("Failed to fetch glossary", {
				operation: `${BaseRunnerService.name}.fetchGlossary`,
			});
		}

		this.services.translator.glossary = glossary;
		this.logger.info("Repository content fetched successfully");
	}

	/**
	 * Fetches and filters files that need translation through a multi-stage pipeline.
	 *
	 * Orchestrates the complete file discovery workflow by coordinating cache checks,
	 * PR filtering, content fetching, and language detection. Each stage progressively
	 * narrows the candidate set to minimize expensive operations like API calls and
	 * content analysis.
	 *
	 * ### Pipeline Stages
	 *
	 * 1. **Language cache lookup**: Queries cache to skip known translated files
	 * 2. **PR existence check**: Validates existing PRs to skip files with valid translations
	 * 3. **Content fetching**: Downloads file content in parallel batches from GitHub
	 * 4. **Language detection**: Analyzes content and updates cache with detection results
	 *
	 * ### Invalid PR Tracking
	 *
	 * Files with existing PRs that have merge conflicts are identified during stage 2
	 * and stored in {@link state.invalidPRsByFile}. This information is later used in
	 * {@link createPullRequestDescription} to add informational notes about conflicted
	 * PRs when creating new translation PRs for the same file.
	 *
	 * @throws {ResourceLoadError} If file content fetch fails during stage 3
	 */
	protected async fetchFilesToTranslate(): Promise<void> {
		if (this.state.filesToTranslate.length) {
			this.logger.info(
				`Found ${String(this.state.filesToTranslate.length)} files to translate (from snapshot)`,
			);
			return;
		}

		const uniqueFiles = this.state.repositoryTree.filter(
			(file, index, self) => index === self.findIndex((f) => f.path === file.path),
		);

		this.logger.info(`Processing ${String(uniqueFiles.length)} files from repository tree...`);

		const { candidateFiles, cacheHits } = this.checkLanguageCache(uniqueFiles);
		const { filesToFetch, numFilesWithPRs, invalidPRsByFile } =
			await this.filterFilesByExistingPRs(candidateFiles);
		const uncheckedFiles = await this.fetchFileContents(filesToFetch);

		this.state.invalidPRsByFile = invalidPRsByFile;
		const { numFilesFiltered, numFilesTooLarge } =
			await this.detectAndCacheLanguages(uncheckedFiles);

		const totalFiltered = cacheHits + numFilesFiltered + numFilesWithPRs + numFilesTooLarge;

		this.logger.info(
			{
				filesToTranslate: this.state.filesToTranslate.length,
				cachedTranslated: cacheHits,
				analyzedTranslated: numFilesFiltered,
				withExistingPRs: numFilesWithPRs,
				tooLarge: numFilesTooLarge,
				totalFiltered,
			},
			`Found ${String(this.state.filesToTranslate.length)} files to translate (${String(totalFiltered)} filtered)`,
		);
	}

	/**
	 * Checks language cache to identify files already known to be translated.
	 *
	 * Queries the cache for each file using its path and content hash (SHA).
	 * Files with cached Portuguese detection results above the confidence threshold
	 * are filtered out, avoiding expensive content fetching and re-analysis.
	 *
	 * @param files Repository tree files to check against cache
	 *
	 * @returns Cache statistics and remaining candidate files for further processing
	 *
	 * @example
	 * ```typescript
	 * const result =  this.checkLanguageCache(repositoryFiles);
	 * console.log(result.cacheHits);
	 * // ^? 135 (out of 192 files)
	 * ```
	 */
	private checkLanguageCache(files: PatchedRepositoryItem[]): CacheCheckResult {
		this.logger.info("Checking language cache");
		const startTime = Date.now();

		const candidateFiles: typeof files = [];

		const filesToFetchCache = files.filter((file) => !!file.sha) as SetRequired<
			PatchedRepositoryItem,
			"sha"
		>[];

		const languageCaches = this.services.languageCache.getMany(
			filesToFetchCache.map(({ filename, sha }) => {
				return { filename, contentHash: sha };
			}),
		);

		let cacheHits = 0;
		let cacheMisses = 0;
		const targetLanguage = this.services.translator.languageDetector.languages.target;

		for (const file of files) {
			const cache = languageCaches.get(file.filename);

			if (
				cache &&
				cache.detectedLanguage === targetLanguage &&
				cache.confidence > MIN_CACHE_CONFIDENCE
			) {
				cacheHits++;
				this.logger.debug(
					{ filename: file.path, language: cache.detectedLanguage, confidence: cache.confidence },
					`Skipping cached ${targetLanguage} file`,
				);
				continue;
			}

			cacheMisses++;
			candidateFiles.push(file);
		}

		const elapsed = Date.now() - startTime;
		const hitRate = `${((cacheHits / files.length) * 100).toFixed(1)}%`;

		this.logger.info(
			{ cacheHits, cacheMisses, hitRate, timeMs: elapsed },
			`Cache check complete: ${String(cacheHits)} hits, ${String(cacheMisses)} candidates`,
		);

		return { candidateFiles, cacheHits, cacheMisses };
	}

	/**
	 * Filters candidate files by checking for existing open pull requests.
	 *
	 * Fetches all open PRs and their changed files to build an accurate mapping of
	 * which files have active PRs. Only skips files with VALID (mergeable) PRs.
	 * Files with invalid/conflicted PRs are processed and tracked for notification
	 * in new PR descriptions.
	 *
	 * ### Filtering Logic
	 *
	 * 1. Fetch all open PRs and their changed files using file-based detection (not title parsing)
	 * 2. Build a map of file paths to PR numbers for efficient lookup
	 * 3. For each candidate file, check if it appears in any PR's changed files
	 * 4. If PR exists, validate its merge status using {@link TranslationBranchManager.checkPullRequestStatus}
	 * 5. Skip files with valid, mergeable PRs (no conflicts)
	 * 6. Track invalid PRs (with conflicts) for later notification in new PR descriptions
	 *
	 * ### PR Status Validation
	 *
	 * Files are only skipped when their associated PR meets ALL criteria:
	 * - PR is open
	 * - PR is mergeable (`needsUpdate === false`)
	 * - PR has no conflicts (`hasConflicts === false`)
	 *
	 * Files with invalid PRs are included for translation, and the invalid PR information
	 * is stored in `invalidPRsByFile` for use in {@link createPullRequestDescription}.
	 *
	 * @param candidateFiles Files remaining after cache check that require PR validation
	 *
	 * @returns A `Promise` resolving to an object containing:
	 * - `filesToFetch`: Files requiring content fetch (no valid PR exists)
	 * - `numFilesWithPRs`: Count of files skipped due to valid existing PRs
	 * - `invalidPRsByFile`: Map of file paths to invalid PR metadata for notification
	 *
	 * @example
	 * ```typescript
	 * const result = await this.filterFilesByExistingPRs(cachedCandidates);
	 * console.log(result.numFilesWithPRs);
	 * // ^? 10 (files with valid, mergeable PRs)
	 * console.log(result.invalidPRsByFile.size);
	 * // ^? 2 (files with conflicted PRs that will be re-translated)
	 * ```
	 */
	private async filterFilesByExistingPRs(
		candidateFiles: PatchedRepositoryItem[],
	): Promise<PullRequestFilterResult> {
		this.logger.info("Checking for existing open PRs with file-based filtering");

		const openPRs = await this.services.github.content.listOpenPullRequests();
		const invalidPRsByFile = new Map<string, { prNumber: number; status: PullRequestStatus }>();
		const prByFile = new Map<string, number>();

		for (const pr of openPRs) {
			try {
				const changedFiles = await this.services.github.content.getPullRequestFiles(pr.number);

				for (const filePath of changedFiles) {
					prByFile.set(filePath, pr.number);
				}

				this.logger.debug(
					{ prNumber: pr.number, fileCount: changedFiles.length },
					"Mapped PR to changed files",
				);
			} catch (error) {
				this.logger.warn(
					{ prNumber: pr.number, error },
					"Failed to fetch PR files, skipping this PR",
				);
			}
		}

		this.logger.debug(
			{ openPRCount: openPRs.length, mappedFiles: prByFile.size },
			"Built file-to-PR mapping",
		);

		let numFilesWithPRs = 0;
		const filesToFetch: typeof candidateFiles = [];

		for (const file of candidateFiles) {
			if (!file.path) {
				filesToFetch.push(file);
				continue;
			}

			const prNumber = prByFile.get(file.path);

			if (prNumber) {
				try {
					const prStatus = await this.services.github.content.checkPullRequestStatus(prNumber);

					if (prStatus.needsUpdate || prStatus.hasConflicts) {
						invalidPRsByFile.set(file.path, { prNumber, status: prStatus });
						filesToFetch.push(file);

						this.logger.debug(
							{
								path: file.path,
								prNumber,
								mergeableState: prStatus.mergeableState,
								hasConflicts: prStatus.hasConflicts,
							},
							"File has invalid PR - will create new translation",
						);
					} else {
						numFilesWithPRs++;
						this.logger.debug(
							{
								path: file.path,
								prNumber,
								mergeableState: prStatus.mergeableState,
							},
							"Skipping file with valid existing PR",
						);
					}
				} catch (error) {
					this.logger.warn(
						{ path: file.path, prNumber, error },
						"Failed to check PR status, including file for processing",
					);
					filesToFetch.push(file);
				}
			} else {
				filesToFetch.push(file);
			}
		}

		this.logger.info(
			{
				validPRs: numFilesWithPRs,
				invalidPRs: invalidPRsByFile.size,
				toFetch: filesToFetch.length,
			},
			`After PR filter: ${String(filesToFetch.length)} files need content fetch`,
		);

		return { filesToFetch, numFilesWithPRs, invalidPRsByFile };
	}

	/**
	 * Fetches file contents from repository in parallel batches.
	 *
	 * Processes files in batches using {@link FILE_FETCH_BATCH_SIZE} to manage concurrent
	 * GitHub API requests. Provides progress logging at 10% intervals and filters out
	 * files with missing metadata.
	 *
	 * @param filesToFetch Files requiring content download
	 *
	 * @returns Successfully fetched files with content ready for language detection
	 *
	 * @example
	 * ```typescript
	 * const files = await this.fetchFileContents(candidates);
	 * console.log(files.length);
	 * // ^? 45 (successfully fetched files)
	 * ```
	 */
	private async fetchFileContents(
		filesToFetch: PatchedRepositoryItem[],
	): Promise<TranslationFile[]> {
		this.logger.info("Fetching file content");

		const uncheckedFiles: TranslationFile[] = [];
		let completedFiles = 0;

		const updateProgress = (): void => {
			completedFiles++;
			const percentage = Math.floor((completedFiles / filesToFetch.length) * 100);
			if (completedFiles % 10 === 0 || completedFiles === filesToFetch.length) {
				this.logger.info(
					`Fetching files: ${String(completedFiles)}/${String(filesToFetch.length)} (${String(percentage)}%)`,
				);
			}
		};

		for (let index = 0; index < filesToFetch.length; index += FILE_FETCH_BATCH_SIZE) {
			const batch = filesToFetch.slice(index, index + FILE_FETCH_BATCH_SIZE);
			const batchResults = await this.fetchBatch(batch, updateProgress);

			uncheckedFiles.push(
				...batchResults.filter((file): file is NonNullable<typeof file> => !!file),
			);
		}

		return uncheckedFiles;
	}

	/**
	 * Performs language detection and updates cache with results.
	 *
	 * Filters files exceeding {@link MAX_FILE_SIZE}, then analyzes remaining files
	 * to detect translation status. Updates the language cache with detection results
	 * (language and confidence) for future runs. Files requiring translation are
	 * added to {@link state.filesToTranslate}.
	 *
	 * @param uncheckedFiles Files with fetched content awaiting language analysis
	 *
	 * @returns Statistics about filtered and analyzed files
	 *
	 * @example
	 * ```typescript
	 * const result = await this.detectAndCacheLanguages(fetchedFiles);
	 * console.log(result.numFilesFiltered);
	 * // ^? 38 (files detected as already translated)
	 * ```
	 */
	private async detectAndCacheLanguages(
		uncheckedFiles: TranslationFile[],
	): Promise<LanguageDetectionResult> {
		let numFilesTooLarge = 0;
		let numFilesFiltered = 0;

		this.state.filesToTranslate = [];

		for (const file of uncheckedFiles) {
			if (file.content.length > MAX_FILE_SIZE) {
				numFilesTooLarge++;

				this.logger.warn(
					{ filename: file.filename, size: file.content.length, maxSize: MAX_FILE_SIZE },
					"Skipping file: exceeds maximum size limit",
				);
				continue;
			}

			const analysis = await this.services.translator.languageDetector.analyzeLanguage(
				file.filename,
				file.content,
			);

			if (file.sha && analysis.detectedLanguage) {
				this.services.languageCache.set(file.path, file.sha, {
					detectedLanguage: analysis.detectedLanguage,
					confidence: analysis.languageScore.target,
					timestamp: Date.now(),
				});
			}

			if (analysis.isTranslated) {
				numFilesFiltered++;
			} else {
				this.state.filesToTranslate.push(file);
			}
		}

		return { numFilesFiltered, numFilesTooLarge };
	}

	/**
	 * Fetches a batch of files and updates the spinner
	 *
	 * @param batch The batch of files to fetch
	 * @param updateLoggerFn The function to update the spinner
	 *
	 * @returns The batch of files
	 */
	protected async fetchBatch(
		batch: PatchedRepositoryItem[],
		updateLoggerFn: () => void,
	): Promise<(TranslationFile | null)[]> {
		return await Promise.all(
			batch.map(async (file) => {
				if (!file.filename || !file.sha || !file.path) return null;

				const content = await this.services.github.content.getFileContent(file);

				updateLoggerFn();

				return new TranslationFile(content, file.filename, file.path, file.sha);
			}),
		);
	}

	/** Updates the progress issue with the translation results */
	protected async updateIssueWithResults(): Promise<void> {
		this.logger.info("Commenting on issue");

		const comment = await this.services.github.content.commentCompiledResultsOnIssue(
			this.state.processedResults,
			this.state.filesToTranslate,
		);

		this.logger.info({ commentUrl: comment.html_url }, "Commented on translation issue");
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
	protected printFinalStatistics(): WorkflowStatistics {
		const elapsedTime = Math.ceil(Date.now() - this.metadata.timestamp);
		const results = Array.from(this.metadata.results.values());

		const successCount = results.filter(({ error }) => !error).length;
		const failureCount = results.filter(({ error }) => !!error).length;

		const failedFiles = results.filter(({ error }) => !!error) as SetNonNullable<
			ProcessedFileResult,
			"error"
		>[];

		if (failedFiles.length > 0) {
			this.logger.warn(
				{
					failures: failedFiles.map(({ filename, error }) => ({ filename, error: error.message })),
				},
				`Failed files (${String(failedFiles.length)})`,
			);
		}

		const totalCount = results.length;
		const successRate = totalCount > 0 ? successCount / totalCount : 0;

		this.logger.info(
			{
				successCount,
				failureCount,
				totalCount,
				elapsedTime: this.formatElapsedTime(elapsedTime),
				successRate,
			},
			"Final statistics",
		);

		return { successCount, failureCount, totalCount, successRate };
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

		return `${(bytes / Math.pow(k, i)).toFixed(1)} ${String(sizes[i])}`;
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
		this.logger.info("Processing files in batches");

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
			this.logger.info(batchInfo, "Processing batch");

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

			this.logger.info(
				{ batchIndex: batchInfo.currentBatch, ...this.batchProgress },
				"Batch processing completed",
			);
		} catch (error) {
			this.logger.error({ error, batchInfo }, "Error processing batch");
			throw error;
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
			`Batch ${String(batchInfo.currentBatch)}/${String(batchInfo.totalBatches)} completed: ${String(this.batchProgress.successful)}/${String(batch.length)} successful (${String(successRate)}%)`,
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
		const metadata = this.metadata.results.get(file.filename) ?? {
			branch: null,
			filename: file.filename,
			translation: null,
			pullRequest: null,
			error: null,
		};

		const fileStartTime = Date.now();

		try {
			this.logger.debug(
				{ filename: file.filename, contentLength: file.content.length },
				"Starting file processing workflow",
			);

			const branchStartTime = Date.now();
			metadata.branch = await this.createOrGetTranslationBranch(file);
			const branchDuration = Date.now() - branchStartTime;

			this.logger.debug(
				{ filename: file.filename, branchRef: metadata.branch.ref, durationMs: branchDuration },
				"Branch creation completed",
			);

			const translationStartTime = Date.now();
			metadata.translation = await this.services.translator.translateContent(file);
			const translationDuration = Date.now() - translationStartTime;

			this.logger.debug(
				{
					filename: file.filename,
					translatedLength: metadata.translation.length,
					durationMs: translationDuration,
				},
				"Translation completed - proceeding to commit",
			);

			const languageName =
				this.services.translator.languageDetector.getLanguageName(
					this.services.translator.languageDetector.languages.target,
				) ?? "Portuguese";

			const commitStartTime = Date.now();
			await this.services.github.content.commitTranslation({
				file,
				branch: metadata.branch,
				content: metadata.translation,
				message: `Translate \`${file.filename}\` to ${languageName}`,
			});
			const commitDuration = Date.now() - commitStartTime;

			this.logger.debug(
				{ filename: file.filename, durationMs: commitDuration },
				"Commit completed - creating pull request",
			);

			const prStartTime = Date.now();
			metadata.pullRequest = await this.createOrUpdatePullRequest(file, {
				title: `Translate \`${file.filename}\` to ${languageName}`,
				body: this.createPullRequestDescription(file, metadata),
			});

			const prDuration = Date.now() - prStartTime;
			const totalDuration = Date.now() - fileStartTime;

			this.logger.debug(
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

			this.logger.error(
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

	abstract run(): Promise<WorkflowStatistics>;

	/**
	 * Creates a comprehensive pull request description for translated content.
	 *
	 * Generates a detailed PR body including translation metadata, review guidelines,
	 * processing statistics, and optional conflict notices. When a file has an existing
	 * invalid PR (with merge conflicts), includes a GitHub Flavored Markdown note to
	 * inform maintainers about the duplicate PR situation.
	 *
	 * ### Description Components
	 *
	 * 1. **Conflict Notice** (conditional): GFM note about existing invalid PRs
	 * 2. **Translation Overview**: Target language and AI-generated disclaimer
	 * 4. **Processing Statistics**: File sizes, compression ratio, timing
	 * 5. **Technical Information**: Model, version, branch details
	 *
	 * ### Invalid PR Detection
	 *
	 * Checks {@link state.invalidPRsByFile} for conflicted PRs associated with the
	 * current file. If found, adds a `[!NOTE]` callout with PR number and mergeable
	 * state to guide maintainers in choosing which PR to merge.
	 *
	 * @param file Translation file being processed with original content
	 * @param processingResult Processing metadata including translation and timing
	 *
	 * @returns Markdown-formatted PR description with all components
	 */
	protected createPullRequestDescription(
		file: TranslationFile,
		processingResult: ProcessedFileResult,
	): string {
		const languageName =
			this.services.translator.languageDetector.getLanguageName(
				this.services.translator.languageDetector.languages.target,
			) ?? "Portuguese";

		const processingTime = Date.now() - this.metadata.timestamp;
		const sourceLength = file.content.length;
		const translationLength = processingResult.translation?.length ?? 0;
		const compressionRatio = sourceLength > 0 ? (translationLength / sourceLength).toFixed(2) : "0";

		const invalidPRInfo = this.state.invalidPRsByFile?.get(file.path);
		const conflictNotice =
			invalidPRInfo ?
				`
> [!NOTE]
> **Existing PR Detected**: This file already has an open pull request (#${String(invalidPRInfo.prNumber)}) with merge conflicts or unmergeable status (\`${invalidPRInfo.status.mergeableState}\`).
>
> This new PR was automatically created with an updated translation. The decision on which PR to merge should be made by repository maintainers based on translation quality and technical requirements.

`
			:	"";

		return `This pull request contains an automated translation of the referenced page to **${languageName}**.
${conflictNotice}

> [!IMPORTANT]
> This translation was generated using AI/LLM and requires human review for accuracy, cultural context, and technical terminology.

<details>
<summary>Translation Details</summary>

### Processing Statistics

| Metric | Value |
|--------|-------|
| **Source File Size** | ${this.formatBytes(sourceLength)} |
| **Translation Size** | ${this.formatBytes(translationLength)} |
| **Content Ratio** | ${compressionRatio}x |
| **File Path** | \`${file.path}\` |
| **Processing Time** | ~${String(Math.ceil(processingTime / 1000))}s |

###### ps.: The content ratio indicates how the translation length compares to the source (1.0x = same length, >1.0x = translation is longer). Different languages naturally have varying verbosity levels.

### Technical Information

- **Target Language**: ${languageName} (\`${this.services.translator.languageDetector.languages.target}\`)
- **AI Model**: \`${env.LLM_MODEL}\` via Open Router API
- **Generated**: ${new Date().toISOString().split("T")[0] ?? "unknown"}
- **Branch**: \`${processingResult.branch?.ref ?? "unknown"}\`
- **Translation Tool Version**: \`${name} v${version}\`


</details>

## Additional Resources

- [Source Repository](${homepage}): Workflow and tooling details
- [Translation Workflow Documentation](${homepage}#readme): Process overview and guidelines`;
	}

	/**
	 * Creates a new branch for translation work, or reuses an existing branch if appropriate.
	 *
	 * This method intelligently handles existing branches by evaluating their associated PRs
	 * for merge conflicts. When a branch already exists, the method checks if there's an open
	 * PR and evaluates its merge status using {@link ContentService.checkPullRequestStatus}.
	 * Branches are only deleted and recreated when their associated PRs have actual merge
	 * conflicts (not when they're simply behind the base branch).
	 *
	 * ### Branch Reuse Scenarios
	 *
	 * 1. **Branch exists with PR having no conflicts**: Reuses existing branch, preserving PR
	 * 2. **Branch exists with PR having conflicts**: Closes PR, deletes branch, creates new branch
	 * 3. **Branch exists without PR**: Reuses existing branch safely
	 * 4. **No existing branch**: Creates new branch from base
	 *
	 * ### Conflict Detection Logic
	 *
	 * The method uses `checkPullRequestStatus()` which only flags PRs with `hasConflicts = true`
	 * when GitHub indicates `mergeable === false` and `mergeable_state === "dirty"`. PRs that
	 * are merely "behind" the base branch are considered safe to reuse and can be updated via
	 * rebase without requiring closure.
	 *
	 * @param file Translation file being processed
	 * @param baseBranch Optional base branch to create from (defaults to fork's default branch)
	 *
	 * @returns Branch reference data containing SHA and branch name for subsequent commit operations
	 *
	 * @example
	 * ```typescript
	 * const branch = await github.createOrGetTranslationBranch(file, 'main');
	 * console.log(branch.ref);
	 * // ^? "refs/heads/translate/content/learn/homepage.md"
	 * ```
	 *
	 * @see {@link ContentService.checkPullRequestStatus} for conflict detection logic
	 * @see {@link BranchService.getBranch} for branch existence checking
	 */
	public async createOrGetTranslationBranch(file: TranslationFile, baseBranch?: string) {
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
				this.logger.debug(
					{ filename: file.filename, branchName },
					"Branch exists without PR, reusing",
				);
				return existingBranch.data;
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
	 * the translation branch and evaluating its merge status. The method uses
	 * {@link ContentService.checkPullRequestStatus} to determine if an existing PR has actual
	 * merge conflicts. PRs are only closed and recreated when they have true conflicts
	 * (indicated by `needsUpdate = true`). PRs that are merely behind the base branch are
	 * preserved since they can be safely rebased without closure.
	 *
	 * ### PR Handling Logic
	 *
	 * 1. **No existing PR**: Creates new PR with provided options
	 * 2. **Existing PR without conflicts**: Returns existing PR (preserves PR number and discussion)
	 * 3. **Existing PR with conflicts**: Closes conflicted PR, creates new PR with updated content
	 *
	 * ### Conflict Resolution
	 *
	 * When conflicts are detected (`needsUpdate = true`), the method:
	 * - Adds an explanatory comment to the existing PR
	 * - Closes the conflicted PR
	 * - Creates a new PR with the same title/body but fresh translation content
	 *
	 * @param file Translation file being processed
	 * @param prOptions Pull request creation options (excluding branch, which is auto-generated)
	 *
	 * @returns Either the newly created PR data or the existing PR data if reused
	 *
	 * @example
	 * ```typescript
	 * const pr = await github.createOrUpdatePullRequest(file, {
	 *   title: 'Translate homepage to Portuguese',
	 *   body: 'Translation of homepage.md',
	 *   baseBranch: 'main'
	 * });
	 * console.log(pr.number);
	 * // ^? Existing PR number if reused, new PR number if created
	 * ```
	 *
	 * @see {@link ContentService.checkPullRequestStatus} for conflict detection logic
	 * @see {@link ContentService.findPullRequestByBranch} for PR lookup
	 */
	public async createOrUpdatePullRequest(
		file: TranslationFile,
		prOptions: Omit<PullRequestOptions, "branch">,
	): Promise<
		| RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]
		| RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
	> {
		const branchName = `translate/${file.path.split("/").slice(2).join("/")}`;
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
					baseBranch: prOptions.baseBranch ?? "main",
				});
			}

			this.logger.debug(
				{ prNumber: existingPR.number, mergeableState: prStatus.mergeableState },
				"PR exists with no conflicts, reusing",
			);
			return existingPR;
		}

		return await this.services.github.content.createPullRequest({
			branch: branchName,
			...prOptions,
			baseBranch: prOptions.baseBranch ?? "main",
		});
	}
}
