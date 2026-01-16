import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { LanguageCacheService } from "../cache";
import type { BranchService, ContentService, RepositoryService } from "../github";
import type { TranslationFile, TranslatorService } from "../translator.service";

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
export type RepositoryTreeItem =
	RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][number];

export interface PatchedRepositoryItem extends RepositoryTreeItem {
	/**
	 * The filename extracted from the file's path
	 *
	 * @example "homepage.md"
	 */
	filename: string;
}

/**
 * Statistics returned from language cache checking operation.
 *
 * Tracks how many files were found in cache versus requiring fresh analysis.
 */
export interface CacheCheckResult {
	/** Files that require further processing (cache miss or invalidation) */
	candidateFiles: PatchedRepositoryItem[];

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
	filesToFetch: PatchedRepositoryItem[];

	/** Number of files skipped because they have existing valid PRs */
	numFilesWithPRs: number;

	/**
	 * Map of file paths to invalid PR information.
	 *
	 * Tracks files that have existing PRs with conflicts or unmergeable status.
	 * Used to add informational notes when creating new PRs for these files.
	 */
	invalidPRsByFile: Map<string, { prNumber: number; status: PullRequestStatus }>;
}

/** Information about a pull request's mergeability and conflict status */
export interface PullRequestStatus {
	/** Whether the PR has actual merge conflicts (dirty state) */
	hasConflicts: boolean;

	/** GitHub's raw mergeable flag (can be null during calculation) */
	mergeable: boolean | null;

	/** GitHub's mergeable state string (clean, behind, dirty, etc.) */
	mergeableState: string;

	/** Whether the PR needs to be closed and recreated due to conflicts */
	needsUpdate: boolean;
}

/**
 * Statistics returned from language detection and caching operation.
 *
 * Summarizes files filtered by size limits and translation status.
 */
export interface LanguageDetectionResult {
	/** Number of files detected as already translated */
	numFilesFiltered: number;

	/** Files that require translation */
	filesToTranslate: TranslationFile[];
}

/**
 * Statistics returned from the workflow execution.
 *
 * Used to determine if the workflow met success rate thresholds.
 */
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

/** Dependency injection interface for GitHub services */
export interface GitHubServices {
	/** Branch management service */
	branch: BranchService;

	/** Repository operations service */
	repository: RepositoryService;

	/** Content and PR management service */
	content: ContentService;
}

/** Dependency injection interface for RunnerService */
export interface RunnerServiceDependencies {
	/** GitHub API services */
	github: GitHubServices;

	/** Translation service for LLM operations */
	translator: TranslatorService;

	/** Language detection cache */
	languageCache: LanguageCacheService;
}

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
