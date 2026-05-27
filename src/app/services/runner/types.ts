import type { PatchedRepositoryTreeItem, PullRequestStatus } from "@/app/services/github/types";
import type { TranslationFile } from "@/app/services/translator/";

/**
 * Tracks progress information for file processing within a batch.
 *
 * Used to provide real-time feedback and coordinate batch operations.
 */
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

/** Result of checking the language-detection cache for candidate files */
export interface CacheCheckResult {
	/** Files that require further processing (cache miss or invalidation) */
	candidateFiles: PatchedRepositoryTreeItem[];

	/** Number of files found in cache with valid translation detection */
	cacheHits: number;

	/** Number of files not in cache or with invalidated entries */
	cacheMisses: number;
}

/** Result of filtering files that already have open pull requests */
export interface PrFilterResult {
	/** Files that need content fetching (no existing PR) */
	filesToFetch: PatchedRepositoryTreeItem[];

	/** Number of files skipped because they have existing valid PRs */
	numFilesWithPRs: number;

	/** Paths mapped to invalid PR info for notes on new PRs */
	invalidPRsByFile: Map<string, { prNumber: number; status: PullRequestStatus }>;
}

/** Result of language detection over fetched file contents */
export interface LanguageDetectionResult {
	/** Number of files detected as already translated */
	numFilesFiltered: number;

	/** Files that require translation */
	filesToTranslate: TranslationFile[];
}

/** Statistics returned from the workflow execution */
export interface WorkflowStatistics {
	/** Number of files successfully translated */
	successCount: number;

	/** Number of files that failed translation */
	failureCount: number;

	/** Total number of files processed (success + failure) */
	totalCount: number;

	/** Success rate as a decimal (0-1) */
	successRate: number;
}
