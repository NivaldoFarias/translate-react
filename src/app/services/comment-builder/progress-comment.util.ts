import type { ProcessedFileResult } from "@/app/services/github/types";
import { PullRequestProgressAction } from "@/app/services/github/types";
import type { TranslationFile } from "@/app/services/translator/";

/**
 * Returns processed files whose pull requests should appear in the translation-progress issue comment.
 *
 * @param results Batch processing results for the current workflow run
 *
 * @returns Results with a newly opened pull request in this run
 */
export function filterReportableProgressCommentResults(results: ProcessedFileResult[]) {
	return results.filter(
		(result) =>
			result.pullRequest !== null &&
			result.pullRequestProgress === PullRequestProgressAction.Created,
	);
}

/**
 * Pairs reportable batch results with their translation files for progress-issue comments.
 *
 * @param results All file results from the current workflow run
 * @param filesToTranslate Files that entered the translation batch
 *
 * @returns Reportable results and matching translation files
 */
export function selectProgressCommentPayload(
	results: ProcessedFileResult[],
	filesToTranslate: TranslationFile[],
) {
	const reportableResults = filterReportableProgressCommentResults(results);

	const reportableFiles = reportableResults
		.map((result) => filesToTranslate.find((file) => file.filename === result.filename))
		.filter((file): file is TranslationFile => file !== undefined);

	return { reportableResults, reportableFiles };
}
