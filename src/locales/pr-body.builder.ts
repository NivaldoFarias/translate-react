import type { PullRequestDescriptionMetadata } from "@/services/runner/managers/translation-batch.manager";
import type { ProcessedFileResult } from "@/services/runner/runner.types";
import type { TranslationFile } from "@/services/translator/translator.service";

import type { LocalePRBodyStrings } from "./locale.types";

import { formatElapsedTime } from "@/utils/common.util";

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
 * @param invalidFilePR Metadata about the closed stale PR
 * @param strings Locale-specific strings for the conflict notice
 *
 * @returns Markdown-formatted notice or empty string if no stale PR existed
 */
function buildConflictNotice(
	invalidFilePR: PullRequestDescriptionMetadata["invalidFilePR"],
	strings: LocalePRBodyStrings["conflictNotice"],
) {
	if (!invalidFilePR) {
		return "";
	}

	return `> [!IMPORTANT]
> **${strings.title}**: ${strings.body(invalidFilePR.prNumber, invalidFilePR.status.mergeableState)}
>
> ${strings.rewriteExplanation}`;
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

		return `${strings.intro(metadata.languageName)}
${conflictNotice}

> [!IMPORTANT]
> ${strings.humanReviewNotice}

<details>
<summary>${strings.detailsSummary}</summary>

### ${strings.stats.header}

| ${strings.stats.metrics.metricColumn} | ${strings.stats.metrics.valueColumn} |
|--------|-------|
| **${strings.stats.metrics.sourceSize}** | ${metadata.content.source} |
| **${strings.stats.metrics.translationSize}** | ${metadata.content.translation} |
| **${strings.stats.metrics.contentRatio}** | ${metadata.content.compressionRatio}x |
| **${strings.stats.metrics.filePath}** | \`${file.path}\` |
| **${strings.stats.metrics.processingTime}** | ~${formatElapsedTime(processingTime, strings.timeFormatLocale)} |

> [!NOTE]
${strings.stats.notes.map((note) => `> - ${note}`).join("\n")}

### ${strings.techInfo.header}

- **${strings.techInfo.generationDate}**: ${generationDate}
- **${strings.techInfo.branch}**: \`${branchRef}\`

</details>`;
	};
}
