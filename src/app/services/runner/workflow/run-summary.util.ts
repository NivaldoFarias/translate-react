import type { ProcessedFileResult } from "@/app/services/github/types";
import type { WorkflowStatistics } from "@/app/services/runner/types";

import type { FailOpenInventory } from "./file-discovery.manager";

import { PullRequestProgressAction } from "@/app/services/github/types";

/** Longest error message shown per failed file, so one stack-like message can't flood the table */
const MAX_SUMMARY_ERROR_LENGTH = 300;

/** Open translation PR whose latest maintainer review asks for changes */
export interface ChangesRequestedPullRequest {
	/** Upstream PR number */
	number: number;

	/** PR page URL */
	url: string;

	/** PR title */
	title: string;
}

/** Everything one translation run reports in its step summary */
export interface RunReport {
	/** Target locale, such as `pt-br` */
	targetLanguage: string;

	/** Message of the error that stopped the run early, or `null` when it completed */
	abortMessage: string | null;

	/** Outcome counts, built from the files processed before any abort */
	statistics: WorkflowStatistics;

	/** Per-file results processed in this run */
	results: readonly ProcessedFileResult[];

	/** Fail-open counts from discovery, or `null` when discovery didn't finish */
	failOpenByReason: FailOpenInventory | null;

	/** GitHub API calls retried with `GH_PAT_TOKEN` after a 403 */
	patFallbackCount: number;

	/** Open translation PRs waiting on requested changes, or `null` when the lookup failed */
	changesRequestedPullRequests: readonly ChangesRequestedPullRequest[] | null;
}

/** Step summary Markdown plus the workflow `::warning::` commands for soft failures */
export interface RunSummary {
	/** Markdown for `$GITHUB_STEP_SUMMARY` */
	markdown: string;

	/** Workflow command lines to print to stdout */
	warnings: string[];
}

/**
 * Builds the translation job's step summary and soft-failure warnings from a run report.
 *
 * Soft failures are problems that don't fail the job: failed files and discovery
 * fail-opens. Each becomes a `::warning::` annotation. PAT fallbacks are only counted in
 * the summary, because a 403 on locale-fork PR updates and upstream comments is expected.
 * Hard failures already turn the job red, and the summary shows their message under
 * "Run stopped early".
 *
 * @param report Run report from {@link BaseRunnerService.buildRunReport}
 *
 * @returns Markdown summary and warning command lines
 *
 * @example
 * ```typescript
 * const { markdown, warnings } = buildRunSummary(report);
 * appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
 * for (const warning of warnings) process.stdout.write(`${warning}\n`);
 * ```
 */
export function buildRunSummary(report: RunReport): RunSummary {
	const failedResults = report.results.filter((result) => result.error);
	const failOpenTotal = sumCounts(report.failOpenByReason ?? {});

	const markdown = [
		`## Translation run: \`${report.targetLanguage}\``,
		buildAbortSection(report.abortMessage),
		buildCountsSection(report.statistics, report.results),
		buildFailedFilesSection(failedResults),
		buildPullRequestsSection(report.results),
		buildAdvisorySection(report.statistics.advisoryIssuesByGuardId),
		buildDegradedSection(report.patFallbackCount, report.failOpenByReason),
		buildChangesRequestedSection(report.changesRequestedPullRequests),
	]
		.filter((section) => section !== "")
		.join("\n\n");

	const warnings = failedResults.map((result) =>
		formatWarning(
			"Translation failed",
			`${result.filename}: ${firstLine(result.error?.message ?? "Unknown error")}`,
		),
	);

	if (failOpenTotal > 0) {
		warnings.push(
			formatWarning(
				"Discovery fail-open",
				`${failOpenTotal} files stayed queued after a check failed; see the step summary`,
			),
		);
	}

	return { markdown: `${markdown}\n`, warnings };
}

/**
 * Renders the early-stop notice, or nothing when the run completed.
 *
 * @param abortMessage Error message that stopped the run
 *
 * @returns Markdown alert or `""`
 */
function buildAbortSection(abortMessage: string | null) {
	if (abortMessage === null) return "";

	return `> [!CAUTION]\n> Run stopped early: ${escapeTableCell(firstLine(abortMessage))}`;
}

/**
 * Renders file counts, PR actions, tokens and cost.
 *
 * @param statistics Run statistics
 * @param results Per-file results, for PR action counts
 *
 * @returns Markdown table and totals
 */
function buildCountsSection(
	statistics: WorkflowStatistics,
	results: readonly ProcessedFileResult[],
) {
	const opened = countByProgress(results, PullRequestProgressAction.Created);
	const updated = countByProgress(results, PullRequestProgressAction.Reused);
	const cost =
		statistics.totalEstimatedCostUsd === null ?
			"not reported"
		:	`$${statistics.totalEstimatedCostUsd.toFixed(4)}`;

	return [
		"| Files | Count |",
		"| --- | ---: |",
		`| Processed | ${statistics.totalCount} |`,
		`| Succeeded | ${statistics.successCount} |`,
		`| Failed | ${statistics.failureCount} |`,
		`| Left for a later run (\`MAX_FILES_PER_RUN\`) | ${statistics.filesLeftOverByCap} |`,
		`| Held by the open-PR ceiling (\`MAX_OPEN_TRANSLATION_PRS\`) | ${statistics.filesHeldByCeiling} |`,
		"",
		`**Pull requests:** ${opened} opened, ${updated} updated.`,
		"",
		`**Tokens:** ${statistics.totalPromptTokens.toLocaleString("en-US")} prompt, ${statistics.totalCompletionTokens.toLocaleString("en-US")} completion. **Cost:** ${cost}.`,
	].join("\n");
}

/**
 * Renders the failed-file table.
 *
 * @param failedResults Results with an error
 *
 * @returns Markdown section or `""`
 */
function buildFailedFilesSection(failedResults: readonly ProcessedFileResult[]) {
	if (failedResults.length === 0) return "";

	const rows = failedResults.map(
		(result) =>
			`| \`${result.filename}\` | ${escapeTableCell(firstLine(result.error?.message ?? "Unknown error"))} |`,
	);

	return ["### Failed files", "", "| File | Error |", "| --- | --- |", ...rows].join("\n");
}

/**
 * Renders the PRs this run opened or updated.
 *
 * @param results Per-file results
 *
 * @returns Markdown list or `""`
 */
function buildPullRequestsSection(results: readonly ProcessedFileResult[]) {
	const lines = results.flatMap((result) => {
		if (!result.pullRequest || !result.pullRequestProgress) return [];

		const action =
			result.pullRequestProgress === PullRequestProgressAction.Created ? "Opened" : "Updated";

		return [
			`- ${action} [#${result.pullRequest.number}](${result.pullRequest.html_url}): \`${result.filename}\``,
		];
	});

	if (lines.length === 0) return "";

	return ["### Pull requests", "", ...lines].join("\n");
}

/**
 * Renders advisory guard issue counts.
 *
 * @param advisoryIssuesByGuardId Issue count per guard id
 *
 * @returns Markdown table or `""`
 */
function buildAdvisorySection(advisoryIssuesByGuardId: Readonly<Record<string, number>>) {
	const entries = Object.entries(advisoryIssuesByGuardId).filter(([, count]) => count > 0);

	if (entries.length === 0) return "";

	const rows = entries.map(([guardId, count]) => `| \`${guardId}\` | ${count} |`);

	return ["### Advisory guard issues", "", "| Guard | Issues |", "| --- | ---: |", ...rows].join(
		"\n",
	);
}

/**
 * Renders degraded paths the run took: PAT fallbacks and discovery fail-opens.
 *
 * @param patFallbackCount PAT fallback count
 * @param failOpenByReason Fail-open counts per reason
 *
 * @returns Markdown list or `""`
 */
function buildDegradedSection(
	patFallbackCount: number,
	failOpenByReason: FailOpenInventory | null,
) {
	const lines: string[] = [];

	if (patFallbackCount > 0) {
		lines.push(`- PAT fallback after a 403 from the App token: ${patFallbackCount} calls`);
	}

	for (const [reason, count] of Object.entries(failOpenByReason ?? {})) {
		if (count > 0) lines.push(`- Discovery fail-open, \`${reason}\`: ${count} files`);
	}

	if (lines.length === 0) return "";

	return ["### Degraded paths", "", ...lines].join("\n");
}

/**
 * Renders open translation PRs whose latest maintainer review asks for changes.
 *
 * @param pullRequests PRs waiting on fixes, or `null` when the lookup failed
 *
 * @returns Markdown list, a lookup-failed note, or `""`
 */
function buildChangesRequestedSection(pullRequests: readonly ChangesRequestedPullRequest[] | null) {
	if (pullRequests === null) {
		return "### Waiting on requested changes\n\nCouldn't check open translation PRs for requested changes in this run.";
	}

	if (pullRequests.length === 0) return "";

	const lines = pullRequests.map(
		(pullRequest) =>
			`- [#${pullRequest.number}](${pullRequest.url}) ${escapeTableCell(pullRequest.title)}`,
	);

	return [
		"### Waiting on requested changes",
		"",
		"Open translation PRs whose latest maintainer review requests changes:",
		"",
		...lines,
	].join("\n");
}

/**
 * Counts results with the given PR action.
 *
 * @param results Per-file results
 * @param action PR action to count
 *
 * @returns Matching result count
 */
function countByProgress(
	results: readonly ProcessedFileResult[],
	action: PullRequestProgressAction,
) {
	return results.filter((result) => result.pullRequestProgress === action).length;
}

/**
 * Sums the values of a count record.
 *
 * @param counts Count per key
 *
 * @returns Total
 */
function sumCounts(counts: Readonly<Record<string, number>>) {
	return Object.values(counts).reduce((total, count) => total + count, 0);
}

/**
 * Returns the first line of a message, truncated to {@link MAX_SUMMARY_ERROR_LENGTH}.
 *
 * @param message Error or status message
 *
 * @returns Single-line message
 */
function firstLine(message: string) {
	const line = message.split("\n", 1)[0]?.trim() ?? "";

	return line.length > MAX_SUMMARY_ERROR_LENGTH ?
			`${line.slice(0, MAX_SUMMARY_ERROR_LENGTH)}...`
		:	line;
}

/**
 * Escapes pipes so text can't break a Markdown table row.
 *
 * @param text Cell text
 *
 * @returns Escaped text
 */
function escapeTableCell(text: string) {
	return text.replaceAll("|", "\\|");
}

/**
 * Formats a GitHub Actions `::warning::` workflow command, escaping its message.
 *
 * @param title Annotation title
 * @param message Annotation message
 *
 * @returns Workflow command line
 *
 * @see https://docs.github.com/actions/reference/workflow-commands-for-github-actions#setting-a-warning-message
 */
function formatWarning(title: string, message: string) {
	const escapeData = (value: string) =>
		value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
	const escapeProperty = (value: string) =>
		escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");

	return `::warning title=${escapeProperty(title)}::${escapeData(message)}`;
}
