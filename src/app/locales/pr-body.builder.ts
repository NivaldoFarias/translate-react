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
 * Formats a guard retry hint as prose or a bullet list when it lists semicolon-separated violations.
 *
 * @param hint Full retry hint from post-translation validation
 *
 * @returns Markdown body text for one validator subsection
 */
function formatReviewerHintBody(hint: string) {
	const violationPattern = /\.\s+(?:fence \d+|Problems found:)/;
	const violationSplit = violationPattern.exec(hint);

	if (violationSplit?.index === undefined) {
		return hint;
	}

	const instructionEnd = violationSplit.index + 1;
	const instruction = hint.slice(0, instructionEnd).trim();
	const violations = hint
		.slice(instructionEnd + 1)
		.split(/;\s*/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (violations.length <= 1) {
		return hint;
	}

	const bullets = violations.map((violation) => `- ${violation}`).join("\n");

	return `${instruction}\n\n${bullets}`;
}

/**
 * Builds the advisory validation warnings section when reviewer notices are present.
 *
 * @param reviewerNotices Advisory guard hints from post-translation validation
 * @param strings Locale-specific strings for the warnings section
 *
 * @returns Markdown-formatted WARNING callout and collapsible details, or empty string if none
 */
function buildReviewerWarningsSection(
	reviewerNotices: PullRequestDescriptionMetadata["reviewerNotices"],
	strings: LocalePRBodyStrings["reviewerWarnings"],
) {
	if (reviewerNotices.length === 0) return "";

	const groupedHints = new Map<string, string[]>();

	for (const notice of reviewerNotices) {
		const hints = groupedHints.get(notice.guardId) ?? [];
		hints.push(notice.hint);
		groupedHints.set(notice.guardId, hints);
	}

	const detailSections = [...groupedHints.entries()]
		.map(([guardId, hints]) => {
			const heading = strings.guardLabel(guardId);
			const body = hints.map((hint) => formatReviewerHintBody(hint)).join("\n\n");

			return `### ${heading}\n\n${body}`;
		})
		.join("\n\n");

	return `> [!WARNING]
> ${strings.intro}

<details>
<summary>${strings.detailsSummary}</summary>

${detailSections}

</details>
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
		const wikiUrl = WIKI_FOR_REACT_DOCS_MAINTAINERS_URL;

		return `${strings.intro(metadata.languageName)}

${conflictNotice}> [!IMPORTANT]
> ${strings.humanReviewNotice(wikiUrl)}

${reviewerWarningsSection}`;
	};
}
