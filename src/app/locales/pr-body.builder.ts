import type { PullRequestDescriptionMetadata } from "@/app/locales/types";
import type { ProcessedFileResult } from "@/app/services/github/types";
import type { TranslationFile } from "@/app/services/translator/";

import type { LocalePRBodyStrings } from "./types";

import { formatElapsedTime, resolveGitHubActionsRunContext } from "@/app/utils/";

/**
 * Formats a timestamp as an ISO date string.
 *
 * @param timestamp Unix timestamp in milliseconds
 *
 * @returns ISO date string (YYYY-MM-DD) or "unknown" if formatting fails
 */
function formatGenerationDate(timestamp: number): string {
	const dateString = new Date(timestamp).toISOString().split("T")[0];
	return dateString ?? "unknown";
}

/**
 * Builds the conflict notice section for PR body when a stale PR was closed.
 *
 * Renders one blockquote line under `[!NOTE]` (bold title, then full body text).
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

	return `**${strings.title}**. ${strings.body(invalidFilePR.prNumber)}`;
}

/**
 * Creates a locale-specific PR body builder function.
 *
 * This factory enables a data-driven approach where each locale provides
 * only the translated strings, while the template structure is shared.
 * This eliminates duplication and ensures consistency across all locales.
 *
 * @param strings Locale-specific strings for the PR body template
 *
 * @returns A function that builds PR body content for the given locale
 *
 * @example
 * ```typescript
 * const ptBrStrings: LocalePRBodyStrings = {
 *   intro: (lang) => `Este PR contém uma tradução para **${lang}**.`,
 *   // ... other strings
 * };
 *
 * export const ptBrLocale: LocaleDefinition = {
 *   pullRequest: {
 *     body: createPRBodyBuilder(ptBrStrings),
 *   },
 * };
 * ```
 */
export function createPRBodyBuilder(strings: LocalePRBodyStrings) {
	return (
		file: TranslationFile,
		processingResult: ProcessedFileResult,
		metadata: PullRequestDescriptionMetadata,
	): string => {
		const processingTime = metadata.timestamps.now - metadata.timestamps.workflowStart;
		const conflictNotice = buildConflictNotice(metadata.invalidFilePR, strings.conflictNotice);
		const generationDate = formatGenerationDate(metadata.timestamps.now);
		const branchRef = processingResult.branch?.ref ?? "unknown";
		const runContext = resolveGitHubActionsRunContext();
		const workflowRunLine =
			runContext ?
				`- **${strings.techInfo.workflowRun}**: [\`${runContext.workflowName}\` · #${runContext.runId}](${runContext.url})`
			:	"";
		const feedbackTipQuoted = strings
			.feedbackTip(metadata.newIssueChooserUrl)
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");

		return `${strings.intro(metadata.languageName)}

> [!IMPORTANT]
> ${strings.humanReviewNotice}

<details>
<summary>${strings.detailsSummary}</summary>

### ${strings.stats.header}

${conflictNotice}

| ${strings.stats.metrics.metricColumn} | ${strings.stats.metrics.valueColumn} |
|--------|-------|
| **${strings.stats.metrics.sourceSize}** | ${metadata.content.source} |
| **${strings.stats.metrics.translationSize}** | ${metadata.content.translation} |
| **${strings.stats.metrics.contentRatio}** | ${metadata.content.compressionRatio}x [^content-ratio] |
| **${strings.stats.metrics.filePath}** | \`${file.path}\` |
| **${strings.stats.metrics.processingTime}** | ~${formatElapsedTime(processingTime, strings.timeFormatLocale)} [^processing-time] |

### ${strings.techInfo.header}

- **${strings.techInfo.generationDate}**: ${generationDate}
- **${strings.techInfo.branch}**: \`${branchRef}\`
- **${strings.techInfo.translationModel}**: \`${metadata.translationModel}\`
${workflowRunLine ? `${workflowRunLine}\n` : ""}

</details>

> [!TIP]
${feedbackTipQuoted}

---

[^content-ratio]: ${strings.stats.notes.contentRatio}
[^processing-time]: ${strings.stats.notes.processingTime}
`;
	};
}
