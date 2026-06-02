import type { PullRequestDescriptionMetadata } from "@/app/locales/types";
import type { ProcessedFileResult } from "@/app/services/github/types";
import type { TranslationFile } from "@/app/services/translator/";

import type { LocalePRBodyStrings } from "./types";

import { WIKI_FOR_REACT_DOCS_MAINTAINERS_URL } from "@/app/constants";
import { formatElapsedTime, resolveGitHubActionsRunContext, resolveString } from "@/app/utils/";

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
 * Builds the validation retries section for PR body when retries occurred.
 *
 * @param retries List of retries that occurred during translation
 * @param strings Locale-specific strings for the retries section
 *
 * @returns Markdown-formatted retries section or empty string if no retries
 */
function buildRetriesSection(
	retries: PullRequestDescriptionMetadata["retries"],
	strings: LocalePRBodyStrings["retries"],
) {
	if (retries.length === 0) return "";

	const tableRows = retries
		.map((retry) => `| \`${retry.guardId}\` | ${retry.message} |`)
		.join("\n");

	return `### ${strings.header}

| ${strings.columns.guardColumn} | ${strings.columns.reasonColumn} |
|-------|--------|
${tableRows}

[^retries]: ${strings.note}
`;
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
		_file: TranslationFile,
		_processingResult: ProcessedFileResult,
		metadata: PullRequestDescriptionMetadata,
	): string => {
		const processingTime = metadata.timestamps.now - metadata.timestamps.workflowStart;
		const conflictNotice = buildConflictNotice(metadata.invalidFilePR, strings.conflictNotice);
		const retriesSection = buildRetriesSection(metadata.retries, strings.retries);
		const runContext = resolveGitHubActionsRunContext();
		const workflowRunLine = resolveString(
			runContext,
			(ctx) =>
				`- **${strings.techInfo.workflowRun}**: [\`${ctx.workflowName}\` #${ctx.runId}](${ctx.url})`,
		);
		const maskVerbatimLine = resolveString(
			metadata.maskVerbatimLargeFences,
			`- **${strings.techInfo.maskVerbatimLargeFences}**: \`true\`\n`,
		);
		const retriesFootnote = resolveString(
			metadata.retries.length > 0,
			`[^retries]: ${strings.retries.note}\n`,
		);
		const maintainerGuideLine = strings.maintainerGuide(WIKI_FOR_REACT_DOCS_MAINTAINERS_URL);

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
| **${strings.stats.metrics.processingTime}** | ~${formatElapsedTime(processingTime, strings.timeFormatLocale)} [^processing-time] |

${retriesSection}### ${strings.techInfo.header}

- **${strings.techInfo.runnerVersion}**: \`${metadata.runnerVersion}\`
- **${strings.techInfo.translationModel}**: \`${metadata.translationModel}\`
- **${strings.techInfo.llmApiHost}**: \`${metadata.llmApiHost}\`
- **${strings.techInfo.nodeEnv}**: \`${metadata.nodeEnv}\`
${maskVerbatimLine}${resolveString(workflowRunLine, (line) => `${line}\n`)}

</details>

${maintainerGuideLine}

[^content-ratio]: ${strings.stats.notes.contentRatio}
[^processing-time]: ${strings.stats.notes.processingTime}
${retriesFootnote}`;
	};
}
