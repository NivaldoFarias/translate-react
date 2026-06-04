import type { ProcessedFileResult, TranslationProgressFileRef } from "@/app/services/github/types";

import { PullRequestProgressAction } from "@/app/services/github/types";

/** One progress-comment section (created or updated pull requests) */
export interface ProgressCommentSectionPayload {
	reportableResults: ProcessedFileResult[];
	reportableFiles: readonly TranslationProgressFileRef[];
}

/** Created and updated pull request groups for the translation-progress issue comment */
export interface ProgressCommentPayload {
	created: ProgressCommentSectionPayload;
	updated: ProgressCommentSectionPayload;
}

/**
 * Returns processed files whose pull requests match the given progress action.
 *
 * @param results Batch processing results for the current workflow run
 * @param action How the pull request was affected in this run
 *
 * @returns Results with a pull request and matching progress action
 */
export function filterProgressCommentResultsByAction(
	results: ProcessedFileResult[],
	action: PullRequestProgressAction,
) {
	return results.filter(
		(result) => result.pullRequest !== null && result.pullRequestProgress === action,
	);
}

/**
 * Returns processed files whose pull requests were newly opened in this run.
 *
 * @param results Batch processing results for the current workflow run
 *
 * @returns Results with {@link PullRequestProgressAction.Created}
 */
export function filterReportableProgressCommentResults(results: ProcessedFileResult[]) {
	return filterProgressCommentResultsByAction(results, PullRequestProgressAction.Created);
}

/**
 * Pairs reportable batch results with their translation files for one progress section.
 *
 * @param reportableResults Results to include in the section
 * @param filesToTranslate Files that entered the translation batch
 *
 * @returns Matching results and translation files
 */
export function matchProgressCommentSectionFiles(
	reportableResults: ProcessedFileResult[],
	filesToTranslate: readonly TranslationProgressFileRef[],
): ProgressCommentSectionPayload {
	const reportableFiles = reportableResults
		.map((result) => filesToTranslate.find((file) => file.filename === result.filename))
		.filter((file): file is TranslationProgressFileRef => file !== undefined);

	return { reportableResults, reportableFiles };
}

/**
 * Pairs batch results with translation files, split by created vs updated pull requests.
 *
 * @param results All file results from the current workflow run
 * @param filesToTranslate Files that entered the translation batch
 *
 * @returns Created and updated sections for the progress issue comment
 */
export function selectProgressCommentPayload(
	results: ProcessedFileResult[],
	filesToTranslate: readonly TranslationProgressFileRef[],
): ProgressCommentPayload {
	const createdResults = filterProgressCommentResultsByAction(
		results,
		PullRequestProgressAction.Created,
	);
	const updatedResults = filterProgressCommentResultsByAction(
		results,
		PullRequestProgressAction.Reused,
	);

	return {
		created: matchProgressCommentSectionFiles(createdResults, filesToTranslate),
		updated: matchProgressCommentSectionFiles(updatedResults, filesToTranslate),
	};
}

/**
 * Whether the run produced pull requests worth posting on the translation-progress issue.
 *
 * @param payload Created and updated sections from {@link selectProgressCommentPayload}
 *
 * @returns `true` when at least one section has reportable pull requests
 */
export function hasReportableProgressComment(payload: ProgressCommentPayload): boolean {
	return (
		payload.created.reportableResults.length > 0 || payload.updated.reportableResults.length > 0
	);
}
