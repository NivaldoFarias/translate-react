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

	/** Queued paths that already have an open translation PR, so translating them refreshes it */
	refreshPaths: Set<string>;
}

/** Result of language detection over fetched file contents */
export interface LanguageDetectionResult {
	/** Number of files detected as already translated */
	numFilesFiltered: number;

	/** Files that require translation */
	filesToTranslate: TranslationFile[];
}

/** Queued files a run left for later runs because of the run limits */
export interface RunBacklog {
	/** Files left for a later run because `MAX_FILES_PER_RUN` was reached */
	filesLeftOverByCap: number;

	/** New files held because open translation PRs reached `MAX_OPEN_TRANSLATION_PRS` */
	filesHeldByCeiling: number;
}

/** Translation outcome counts from batch processing, before run-limit backlog is added */
export type TranslationOutcomeStatistics = Omit<WorkflowStatistics, keyof RunBacklog>;

/** Statistics returned from the workflow execution */
export interface WorkflowStatistics extends RunBacklog {
	/** Number of files successfully translated */
	successCount: number;

	/** Number of files that failed translation */
	failureCount: number;

	/** Total number of files processed (success + failure) */
	totalCount: number;

	/** Success rate as a decimal (0-1) */
	successRate: number;

	/** Sum of prompt tokens across successful file translations */
	totalPromptTokens: number;

	/** Sum of completion tokens across successful file translations */
	totalCompletionTokens: number;

	/** Sum of OpenRouter `usage.cost` when reported; `null` when no cost data */
	totalEstimatedCostUsd: number | null;

	/** Files whose PRs include advisory post-translation reviewer notices */
	filesWithReviewerWarnings: number;

	/** Count of advisory issues per guard id across the run */
	advisoryIssuesByGuardId: Readonly<Record<string, number>>;
}
