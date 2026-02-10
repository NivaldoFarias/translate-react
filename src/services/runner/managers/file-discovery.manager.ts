import type { SetRequired } from "type-fest";

import type {
	CacheCheckResult,
	LanguageDetectionResult,
	PatchedRepositoryTreeItem,
	PrFilterResult as PullRequestFilterResult,
	PullRequestStatus,
	RunnerServiceDependencies,
} from "../runner.types";

import { LanguageDetectorService } from "@/services/language-detector/";
import { TranslationFile } from "@/services/translator/";
import { logger } from "@/utils/";

import {
	FILE_FETCH_BATCH_SIZE,
	LANGUAGE_CACHE_TTL_MS,
	MIN_CACHE_CONFIDENCE,
} from "./managers.constants";

/**
 * Manages file discovery and filtering pipeline for translation workflow.
 *
 * Orchestrates the multi-stage file discovery process including cache checks,
 * PR validation, content fetching, and language detection. Each stage progressively
 * narrows the candidate set to minimize expensive operations.
 */
export class FileDiscoveryManager {
	private readonly logger = logger.child({ component: FileDiscoveryManager.name });

	/**
	 * Initializes the file discovery manager with service dependencies.
	 *
	 * @param services Injected service dependencies for GitHub, translation, and caching
	 */
	constructor(private readonly services: RunnerServiceDependencies) {}

	/**
	 * Discovers and filters files requiring translation through complete pipeline.
	 *
	 * Executes the full file discovery workflow by coordinating markdown filtering,
	 * cache checks, PR filtering, content fetching, and language detection. Returns
	 * files ready for translation along with metadata about invalid PRs for notification.
	 *
	 * ### Pipeline Stages
	 *
	 * 1. **Markdown filter**: Filters to markdown files in `src/` directory
	 * 2. **Deduplication**: Removes duplicate file paths
	 * 3. **Language cache lookup**: Queries cache to skip known translated files
	 * 4. **PR existence check**: Validates existing PRs to skip files with valid translations
	 * 5. **Content fetching**: Downloads file content in parallel batches from GitHub
	 * 6. **Language detection**: Analyzes content and updates cache with detection results
	 *
	 * @param repositoryTree Complete repository file tree from GitHub
	 *
	 * @returns Object containing files to translate and map of invalid PRs by file path
	 *
	 * @example
	 * ```typescript
	 * const result = await fileDiscovery.discoverFiles(treeItems);
	 * console.log(result.filesToTranslate.length);
	 * // ^? 45 (files requiring translation)
	 * console.log(result.invalidPRsByFile.size);
	 * // ^? 2 (files with conflicted PRs)
	 * ```
	 */
	public async discoverFiles(repositoryTree: PatchedRepositoryTreeItem[]): Promise<{
		filesToTranslate: TranslationFile[];
		invalidPRsByFile: Map<string, { prNumber: number; status: PullRequestStatus }>;
	}> {
		this.logger.debug({ fileCount: repositoryTree.length }, "Starting file discovery pipeline");

		const uniqueFiles = repositoryTree.filter(
			(file, index, self) => index === self.findIndex((compare) => compare.path === file.path),
		);
		this.logger.debug(
			{ before: repositoryTree.length, after: uniqueFiles.length },
			"Stage 1/5: Deduplication complete",
		);

		const { candidateFiles, cacheHits, cacheMisses } = this.checkCache(uniqueFiles);
		this.logger.debug(
			{ before: uniqueFiles.length, after: candidateFiles.length, cacheHits, cacheMisses },
			"Stage 2/5: Cache lookup complete",
		);

		const { filesToFetch, numFilesWithPRs, invalidPRsByFile } =
			await this.filterByPRs(candidateFiles);
		this.logger.debug(
			{
				before: candidateFiles.length,
				after: filesToFetch.length,
				skippedByValidPRs: numFilesWithPRs,
				invalidPRs: invalidPRsByFile.size,
			},
			"Stage 3/5: PR filter complete",
		);

		const uncheckedFiles = await this.fetchContent(filesToFetch);
		this.logger.debug(
			{ before: filesToFetch.length, after: uncheckedFiles.length },
			"Stage 4/5: Content fetch complete",
		);

		const { numFilesFiltered, filesToTranslate } =
			await this.detectAndCacheLanguages(uncheckedFiles);
		this.logger.debug(
			{
				before: uncheckedFiles.length,
				after: filesToTranslate.length,
				detectedAsTranslated: numFilesFiltered,
			},
			"Stage 5/5: Language detection complete",
		);

		const totalFiltered = cacheHits + numFilesFiltered + numFilesWithPRs;

		this.logger.info(
			{
				pipeline: {
					initial: repositoryTree.length,
					afterDedup: uniqueFiles.length,
					afterCache: candidateFiles.length,
					afterPRFilter: filesToFetch.length,
					afterContentFetch: uncheckedFiles.length,
					final: filesToTranslate.length,
				},
				filtered: {
					byCache: cacheHits,
					byExistingPRs: numFilesWithPRs,
					byLanguageDetection: numFilesFiltered,
					total: totalFiltered,
				},
			},
			`Translation pipeline complete: ${filesToTranslate.length} files need translation (${totalFiltered} filtered across stages)`,
		);

		return { filesToTranslate, invalidPRsByFile };
	}

	/**
	 * Builds cache key from filename and content hash.
	 *
	 * Format: `filename:contentHash` ensures uniqueness based on both file
	 * identity and content version.
	 *
	 * @param file File to build cache key for
	 *
	 * @returns Cache key
	 */
	private buildLanguageCacheKey(
		file: SetRequired<PatchedRepositoryTreeItem, "sha"> | TranslationFile,
	): string {
		return `${file.filename}:${file.sha}`;
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
	 * const result = this.checkCache(repositoryFiles);
	 * console.log(result.cacheHits);
	 * // ^? 135 (out of 192 files)
	 * ```
	 */
	public checkCache(files: PatchedRepositoryTreeItem[]): CacheCheckResult {
		const candidateFiles: typeof files = [];

		const filesToFetchCache = files.filter((file) => !!file.sha) as SetRequired<
			PatchedRepositoryTreeItem,
			"sha"
		>[];

		const cacheKeys = filesToFetchCache.map((file) => this.buildLanguageCacheKey(file));
		const languageCaches = this.services.languageCache.getMany(cacheKeys);

		let cacheHits = 0;
		let cacheMisses = 0;
		const targetLanguage = LanguageDetectorService.languages.target;

		for (const file of files) {
			if (!file.sha) {
				cacheMisses++;
				candidateFiles.push(file);
				continue;
			}

			const cacheKey = this.buildLanguageCacheKey(file);
			const cache = languageCaches.get(cacheKey);

			if (cache?.detectedLanguage === targetLanguage && cache.confidence > MIN_CACHE_CONFIDENCE) {
				cacheHits++;
				continue;
			}

			cacheMisses++;
			candidateFiles.push(file);
		}

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
	 * 4. If PR exists, validate its merge status
	 * 5. Skip files with valid, mergeable PRs (no conflicts)
	 * 6. Track invalid PRs (with conflicts) for later notification in new PR descriptions
	 *
	 *
	 * ### PR Status Validation
	 *
	 * Files are only skipped when their associated PR meets ALL criteria:
	 * - PR is open
	 * - PR is mergeable (`needsUpdate === false`)
	 * - PR has no conflicts (`hasConflicts === false`)
	 * - PR was not created by the bot or the current user
	 * - PR's last commit author is not the bot or the current user
	 *
	 * Files with invalid PRs are included for translation, and the invalid PR information
	 * is stored in `invalidPRsByFile` for use in PR descriptions.
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
	 * const result = await this.filterByPRs(cachedCandidates);
	 * console.log(result.numFilesWithPRs);
	 * // ^? 10 (files with valid, mergeable PRs)
	 * console.log(result.invalidPRsByFile.size);
	 * // ^? 2 (files with conflicted PRs that will be re-translated)
	 * ```
	 */
	public async filterByPRs(
		candidateFiles: PatchedRepositoryTreeItem[],
	): Promise<PullRequestFilterResult> {
		const openPRs = await this.services.github.listOpenPullRequests();
		const invalidPRsByFile = new Map<string, { prNumber: number; status: PullRequestStatus }>();
		const prByFile = new Map<string, number>();

		for (const pr of openPRs) {
			try {
				const changedFiles = await this.services.github.getPullRequestFiles(pr.number);

				for (const filePath of changedFiles) {
					prByFile.set(filePath, pr.number);
				}
			} catch (error) {
				this.logger.warn(
					{ prNumber: pr.number, error },
					"Failed to fetch PR files, skipping this PR",
				);
			}
		}

		let numFilesWithPRs = 0;
		const forkOwner = this.services.github.getForkOwner();
		const currentUser = await this.services.github.getCurrentUser();
		const filesToFetch: typeof candidateFiles = [];

		for (const file of candidateFiles) {
			const prNumber = prByFile.get(file.path);

			if (!prNumber) {
				filesToFetch.push(file);
				continue;
			}

			try {
				const prStatus = await this.services.github.checkPullRequestStatus(prNumber);
				const isCreatedByBotOrUser =
					prStatus.createdBy === forkOwner || prStatus.createdBy === currentUser;
				const isLastCommitAuthorBotOrUser =
					prStatus.lastCommitAuthor === forkOwner || prStatus.lastCommitAuthor === currentUser;

				if (
					(prStatus.needsUpdate || prStatus.hasConflicts) &&
					!isCreatedByBotOrUser &&
					!isLastCommitAuthorBotOrUser
				) {
					invalidPRsByFile.set(file.path, { prNumber, status: prStatus });
					filesToFetch.push(file);

					this.logger.debug(
						{
							path: file.path,
							prNumber,
							mergeableState: prStatus.mergeableState,
							hasConflicts: prStatus.hasConflicts,
							createdBy: prStatus.createdBy,
						},
						"File has invalid PR created by someone else. Will create new translation",
					);
				} else if (prStatus.needsUpdate || prStatus.hasConflicts) {
					numFilesWithPRs++;
					this.logger.debug(
						{
							path: file.path,
							prNumber,
							mergeableState: prStatus.mergeableState,
							hasConflicts: prStatus.hasConflicts,
							createdBy: prStatus.createdBy,
						},
						"Skipping file with conflicted PR created by bot/user. Will not recreate",
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
		}

		this.logger.info(
			{
				validPRs: numFilesWithPRs,
				invalidPRs: invalidPRsByFile.size,
				toFetch: filesToFetch.length,
			},
			`After PR filter: ${filesToFetch.length} files need content fetch`,
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
	 * const files = await this.fetchContent(candidates);
	 * console.log(files.length);
	 * // ^? 45 (successfully fetched files)
	 * ```
	 */
	public async fetchContent(filesToFetch: PatchedRepositoryTreeItem[]): Promise<TranslationFile[]> {
		const uncheckedFiles: TranslationFile[] = [];
		const totalBatches = Math.ceil(filesToFetch.length / FILE_FETCH_BATCH_SIZE);

		for (let index = 0; index < filesToFetch.length; index += FILE_FETCH_BATCH_SIZE) {
			const batchNumber = Math.floor(index / FILE_FETCH_BATCH_SIZE) + 1;
			const batch = filesToFetch.slice(index, index + FILE_FETCH_BATCH_SIZE);

			this.logger.debug(
				{ batch: batchNumber, totalBatches, batchSize: batch.length },
				`Fetching content batch ${batchNumber}/${totalBatches}`,
			);

			const batchResults = await this.fetchBatch(batch);
			const successfulFetches = batchResults.filter(
				(file): file is NonNullable<typeof file> => !!file,
			);

			uncheckedFiles.push(...successfulFetches);

			this.logger.debug(
				{
					batch: batchNumber,
					fetched: successfulFetches.length,
					failed: batch.length - successfulFetches.length,
				},
				`Batch ${batchNumber}/${totalBatches} complete`,
			);
		}

		return uncheckedFiles;
	}

	/**
	 * Fetches a batch of files from GitHub API.
	 *
	 * @param batch Files to fetch in current batch
	 *
	 * @returns Array of translation files or `null` for failed fetches
	 */
	private fetchBatch(batch: PatchedRepositoryTreeItem[]): Promise<(TranslationFile | null)[]> {
		return Promise.all(batch.map((file) => this.services.github.getFile(file)));
	}

	/**
	 * Performs language detection and updates cache with results.
	 *
	 * Filters files exceeding {@link MAX_FILE_SIZE}, then analyzes remaining files
	 * to detect translation status. Updates the language cache with detection results
	 * (language and confidence) for future runs. Files requiring translation are
	 * returned in the result.
	 *
	 * @param uncheckedFiles Files with fetched content awaiting language analysis
	 *
	 * @returns Statistics about filtered and analyzed files, plus files needing translation
	 *
	 * @example
	 * ```typescript
	 * const result = await this.detectAndCacheLanguages(fetchedFiles);
	 * console.log(result.numFilesFiltered);
	 * // ^? 38 (files detected as already translated)
	 * console.log(result.filesToTranslate.length);
	 * // ^? 7 (files requiring translation)
	 * ```
	 */
	private async detectAndCacheLanguages(
		uncheckedFiles: TranslationFile[],
	): Promise<LanguageDetectionResult> {
		let numFilesFiltered = 0;
		const filesToTranslate: TranslationFile[] = [];

		for (const file of uncheckedFiles) {
			const analysis = await this.services.languageDetector.analyzeLanguage(
				file.filename,
				file.content,
			);

			if (file.sha && analysis.detectedLanguage) {
				const cacheKey = this.buildLanguageCacheKey(file);

				this.services.languageCache.set(
					cacheKey,
					{
						detectedLanguage: analysis.detectedLanguage,
						confidence: analysis.languageScore.target,
						timestamp: Date.now(),
					},
					LANGUAGE_CACHE_TTL_MS,
				);
			}

			if (analysis.isTranslated) {
				numFilesFiltered++;
			} else {
				filesToTranslate.push(file);
			}
		}

		return { numFilesFiltered, filesToTranslate };
	}
}
