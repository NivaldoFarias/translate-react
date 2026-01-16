import type { SetRequired } from "type-fest";

import type {
	CacheCheckResult,
	LanguageDetectionResult,
	PatchedRepositoryItem,
	PrFilterResult as PullRequestFilterResult,
	PullRequestStatus,
	RunnerServiceDependencies,
} from "./runner.types";

import { FILE_FETCH_BATCH_SIZE, logger, MIN_CACHE_CONFIDENCE } from "@/utils/";

import { TranslationFile } from "../translator.service";

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
	 * Executes the full file discovery workflow by coordinating cache checks, PR filtering,
	 * content fetching, and language detection. Returns files ready for translation along
	 * with metadata about invalid PRs for notification purposes.
	 *
	 * ### Pipeline Stages
	 *
	 * 1. **Language cache lookup**: Queries cache to skip known translated files
	 * 2. **PR existence check**: Validates existing PRs to skip files with valid translations
	 * 3. **Content fetching**: Downloads file content in parallel batches from GitHub
	 * 4. **Language detection**: Analyzes content and updates cache with detection results
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
	async discoverFiles(repositoryTree: PatchedRepositoryItem[]): Promise<{
		filesToTranslate: TranslationFile[];
		invalidPRsByFile: Map<string, { prNumber: number; status: PullRequestStatus }>;
	}> {
		const uniqueFiles = repositoryTree.filter(
			(file, index, self) => index === self.findIndex((compare) => compare.path === file.path),
		);

		this.logger.info(`Processing ${uniqueFiles.length} files from repository tree`);

		const { candidateFiles, cacheHits } = this.checkCache(uniqueFiles);

		const { filesToFetch, numFilesWithPRs, invalidPRsByFile } =
			await this.filterByPRs(candidateFiles);

		const uncheckedFiles = await this.fetchContent(filesToFetch);

		const { numFilesFiltered, filesToTranslate } =
			await this.detectAndCacheLanguages(uncheckedFiles);

		const totalFiltered = cacheHits + numFilesFiltered + numFilesWithPRs;

		this.logger.info(
			{
				pipeline: {
					initial: uniqueFiles.length,
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
	checkCache(files: PatchedRepositoryItem[]): CacheCheckResult {
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

			if (cache?.detectedLanguage === targetLanguage && cache.confidence > MIN_CACHE_CONFIDENCE) {
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
			`Cache check complete: ${cacheHits} hits, ${cacheMisses} candidates`,
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
	 * 4. If PR exists, validate its merge status
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
	async filterByPRs(candidateFiles: PatchedRepositoryItem[]): Promise<PullRequestFilterResult> {
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
	public async fetchContent(filesToFetch: PatchedRepositoryItem[]): Promise<TranslationFile[]> {
		this.logger.info("Fetching file content");

		const uncheckedFiles: TranslationFile[] = [];
		let completedFiles = 0;

		const updateProgress = (): void => {
			completedFiles++;
			const percentage = Math.floor((completedFiles / filesToFetch.length) * 100);
			if (completedFiles % 10 === 0 || completedFiles === filesToFetch.length) {
				this.logger.info(
					`Fetching files: ${completedFiles}/${filesToFetch.length} (${percentage}%)`,
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
	 * Fetches a batch of files from GitHub API.
	 *
	 * @param batch Files to fetch in current batch
	 * @param updateLoggerFn Progress update callback
	 *
	 * @returns Array of translation files or null for failed fetches
	 */
	private async fetchBatch(
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
				filesToTranslate.push(file);
			}
		}

		return { numFilesFiltered, filesToTranslate };
	}
}
