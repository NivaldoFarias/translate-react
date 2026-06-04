import type { PullRequestDescriptionMetadata } from "@/app/locales/types";
import type { ProcessedFileResult } from "@/app/services/github/types";
import type { TranslationFile } from "@/app/services/translator/";

import type { LocalePRBodyStrings } from "./types";

import { WIKI_FOR_REACT_DOCS_MAINTAINERS_URL } from "@/app/constants";

/**
 * Builds the conflict notice section for PR body when a stale PR was closed.
 *
 * @param invalidFilePR Metadata about the closed stale PR
 * @param strings Locale-specific strings for the conflict notice
 *
 * @returns Markdown-formatted notice or empty string if no stale PR existed
 */
function buildConflictNotice(
	invalidFilePR: PullRequestDescriptionMetadata["invalidFilePR"],
	strings: LocalePRBodyStrings["conflictNotice"],
) {
	if (!invalidFilePR) return "";

	return `> [!NOTE]
> **${strings.title}**. ${strings.body(invalidFilePR.prNumber)}
`;
}

/**
 * Builds the advisory validation warnings section when reviewer notices are present.
 *
 * @param reviewerNotices Advisory guard hints from post-translation validation
 * @param strings Locale-specific strings for the warnings section
 *
 * @returns Markdown-formatted WARNING block and hint table, or empty string if none
 */
function buildReviewerWarningsSection(
	reviewerNotices: PullRequestDescriptionMetadata["reviewerNotices"],
	strings: LocalePRBodyStrings["reviewerWarnings"],
) {
	if (reviewerNotices.length === 0) return "";

	const tableRows = reviewerNotices
		.map((notice) => `| \`${notice.guardId}\` | ${notice.hint} |`)
		.join("\n");

	return `> [!WARNING]
> ${strings.intro}

| ${strings.columns.guardColumn} | ${strings.columns.whatToFixColumn} |
| ------------------------ | ----------------------------------------- |
${tableRows}
`;
}

/**
 * Creates a locale-specific PR body builder function.
 *
 * @param strings Locale-specific strings for the PR body template
 *
 * @returns A function that builds PR body content for the given locale
 */
export function createPRBodyBuilder(strings: LocalePRBodyStrings) {
	return (
		_file: TranslationFile,
		_processingResult: ProcessedFileResult,
		metadata: PullRequestDescriptionMetadata,
	): string => {
		const conflictNotice = buildConflictNotice(metadata.invalidFilePR, strings.conflictNotice);
		const reviewerWarningsSection = buildReviewerWarningsSection(
			metadata.reviewerNotices,
			strings.reviewerWarnings,
		);
		const maintainerGuideLine = strings.maintainerGuide(WIKI_FOR_REACT_DOCS_MAINTAINERS_URL);

		return `${strings.intro(metadata.languageName)}

${conflictNotice}> [!IMPORTANT]
> ${strings.humanReviewNotice}

${reviewerWarningsSection}
${maintainerGuideLine}`;
	};
}
