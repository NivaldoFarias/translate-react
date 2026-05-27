import type { ProcessedFileResult } from "@/app/domain/workflow/";
import type { TranslationFile } from "@/app/services/translator/";

import { filterReportableProgressCommentResults } from "@/app/domain/workflow/";

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
