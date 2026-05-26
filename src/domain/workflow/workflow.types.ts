import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { SetRequired } from "type-fest";

import type { TranslationFile } from "@/services/translator/";

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

/**
 * How this workflow run affected the pull request for a translated file.
 *
 * Only {@link PullRequestProgressAction.Created} belongs in the translation-progress issue comment.
 */
export enum PullRequestProgressAction {
	/** A new pull request was opened after committing the translation */
	Created = "created",

	/** An open translation pull request was already valid; this run did not translate or commit */
	Reused = "reused",
}

/**
 * Result metadata for a single processed file.
 *
 * Captures all artifacts and outcomes from the translation workflow,
 * including branch references, translations, pull requests, and errors.
 */
export interface ProcessedFileResult {
	/** Git reference for the translation branch created for this file */
	branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"] | null;

	/** Name of the file being processed */
	filename: string;

	/** Translated content (null if translation failed) */
	translation: string | null;

	/** Pull request created or updated for this translation */
	pullRequest:
		| RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]
		| RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
		| null;

	/**
	 * Whether this run opened a pull request or reused an existing valid one.
	 *
	 * `null` when no pull request applies (failure, no-op translation, etc.).
	 */
	pullRequestProgress: PullRequestProgressAction | null;

	/** Error encountered during processing (null if successful) */
	error: Error | null;
}

/**
 * Returns processed files whose pull requests should appear in the translation-progress issue comment.
 *
 * @param results Batch processing results for the current workflow run
 *
 * @returns Results with a newly opened pull request in this run
 *
 * @example
 * ```typescript
 * const reportable = filterReportableProgressCommentResults(batchResults);
 * ```
 */
export function filterReportableProgressCommentResults(results: ProcessedFileResult[]) {
	return results.filter(
		(result) =>
			result.pullRequest !== null &&
			result.pullRequestProgress === PullRequestProgressAction.Created,
	);
}

/** Repository tree item from GitHub's Git Tree API */
export type RepositoryTreeItem =
	RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][number];

export interface PatchedRepositoryTreeItem extends SetRequired<RepositoryTreeItem, "path" | "sha"> {
	/** Filename extracted from the file path */
	filename: string;
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

/** Pull request mergeability and conflict status */
export interface PullRequestStatus {
	/** Whether the PR has actual merge conflicts (dirty state) */
	hasConflicts: boolean;

	/** GitHub's raw mergeable flag (can be null during calculation) */
	mergeable: boolean | null;

	/** GitHub's mergeable state string (clean, behind, dirty, etc.) */
	mergeableState: string;

	/** Whether the PR needs to be closed and recreated due to conflicts */
	needsUpdate: boolean;

	/** GitHub username of the PR creator */
	createdBy: string;
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

/** Language detection cache entry */
export interface LanguageCacheEntry {
	/** Detected language code (e.g. `"pt"`, `"en"`) */
	detectedLanguage: string;

	/** Confidence score from `0` to `1` */
	confidence: number;

	/** Timestamp when language was detected */
	timestamp: number;
}
