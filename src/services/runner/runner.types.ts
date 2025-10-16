import type { RestEndpointMethodTypes } from "@octokit/rest";

/**
 * Configuration options for the runner service.
 *
 * Controls batch processing and workflow behavior.
 */
export interface RunnerOptions {
	/** The number of files to process in each batch */
	batchSize: number;
}

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

	/** Error encountered during processing (null if successful) */
	error: Error | null;
}

/**
 * Array of repository tree items from GitHub's Git Tree API.
 *
 * Represents the file structure of a repository at a specific commit.
 * Each item contains metadata like path, SHA, type, and size.
 */
export type RepositoryTreeItems =
	RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];

/**
 * Statistics returned from language cache checking operation.
 *
 * Tracks how many files were found in cache versus requiring fresh analysis.
 */
export interface CacheCheckResult {
	/** Files that require further processing (cache miss or invalidation) */
	candidateFiles: RepositoryTreeItems;

	/** Number of files found in cache with valid translation detection */
	cacheHits: number;

	/** Number of files not in cache or with invalidated entries */
	cacheMisses: number;
}

/**
 * Statistics returned from PR filtering operation.
 *
 * Identifies which files already have open pull requests and can be skipped.
 */
export interface PrFilterResult {
	/** Files that need content fetching (no existing PR) */
	filesToFetch: RepositoryTreeItems;

	/** Number of files skipped because they have existing open PRs */
	numFilesWithPRs: number;
}

/**
 * Statistics returned from language detection and caching operation.
 *
 * Summarizes files filtered by size limits and translation status.
 */
export interface LanguageDetectionResult {
	/** Number of files detected as already translated */
	numFilesFiltered: number;

	/** Number of files exceeding maximum size limit */
	numFilesTooLarge: number;
}
