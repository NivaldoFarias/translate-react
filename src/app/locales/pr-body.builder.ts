import type { PullRequestDescriptionMetadata } from "@/app/locales/types";
import type { ProcessedFileResult } from "@/app/services/github/types";
import type { TranslationFile } from "@/app/services/translator/";

import type { LocalePRBodyStrings } from "./types";

import { WIKI_FOR_REACT_DOCS_MAINTAINERS_URL } from "@/app/constants";
import { buildReviewerWarningsMarkdown } from "@/app/services/comment-builder/reviewer-warnings.util";

/**
 * Builds the conflict notice section for PR body when the branch was refreshed
 * after conflicting with the base branch.
 *
 * @param invalidFilePR Metadata about the out-of-sync pull request being refreshed
 * @param strings Locale-specific strings for the conflict notice
 *
 * @returns Markdown-formatted notice or empty string when no conflict occurred
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
 * Creates a locale-specific PR body builder function.
 *
 * @param strings Locale-specific strings for the PR body template
 *
 * @returns A function that builds PR body content for the given locale
 */
export function createPRBodyBuilder(strings: LocalePRBodyStrings) {
	return (
		file: TranslationFile,
		processingResult: ProcessedFileResult,
		metadata: PullRequestDescriptionMetadata,
	): string => {
		const conflictNotice = buildConflictNotice(metadata.invalidFilePR, strings.conflictNotice);
		const reviewerWarningsSection = buildReviewerWarningsMarkdown(
			metadata.reviewerNotices,
			strings.reviewerWarnings,
			file.content,
			processingResult.translation,
		);
		const wikiUrl = WIKI_FOR_REACT_DOCS_MAINTAINERS_URL;

		const conflictSection = conflictNotice ? `${conflictNotice}\n` : "";

		return `${conflictSection}${strings.humanReviewNotice}

> [!TIP]
> ${strings.maintainerWikiTip(wikiUrl)}

${reviewerWarningsSection}`;
	};
}
