import { describe, expect, test } from "bun:test";

import type { ProcessedFileResult } from "@/app/services/github/types";
import type { WorkflowStatistics } from "@/app/services/runner/types";
import type { RunReport } from "@/app/services/runner/workflow/run-summary.util";

import { FAIL_OPEN_REASONS } from "@/app/constants/fail-open.constants";
import { PullRequestProgressAction } from "@/app/services/github/types";
import { buildRunSummary } from "@/app/services/runner/workflow/run-summary.util";

import { createProcessedFileResultsFixture } from "@tests/fixtures";

const NO_FAIL_OPEN = {
	[FAIL_OPEN_REASONS.prValidityEvaluationError]: 0,
	[FAIL_OPEN_REASONS.languageDetectionEmptyContent]: 0,
	[FAIL_OPEN_REASONS.languageDetectionShortContent]: 0,
	[FAIL_OPEN_REASONS.languageDetectionCldUnreliable]: 0,
};

/** Statistics for one opened PR, one updated PR and one failed file */
function createStatistics(overrides: Partial<WorkflowStatistics> = {}): WorkflowStatistics {
	return {
		successCount: 2,
		failureCount: 1,
		totalCount: 3,
		successRate: 2 / 3,
		totalPromptTokens: 12_345,
		totalCompletionTokens: 6_789,
		totalEstimatedCostUsd: 0.0123,
		filesWithReviewerWarnings: 1,
		advisoryIssuesByGuardId: { headingCapitalization: 2 },
		filesLeftOverByCap: 4,
		filesHeldByCeiling: 1,
		...overrides,
	};
}

/** One successful result fixture for `file-<index>.md` with PR `#<index>` */
function createResult(index: number): ProcessedFileResult {
	const result = createProcessedFileResultsFixture({ count: index }).at(-1);
	if (!result) throw new Error(`No processed result fixture for index ${index}`);

	return result;
}

/** Results: `file-1.md` opened #1, `file-2.md` updated #2, `file-3.md` failed */
function createResults(): ProcessedFileResult[] {
	return [
		createResult(1),
		{ ...createResult(2), pullRequestProgress: PullRequestProgressAction.Reused },
		{
			...createResult(3),
			pullRequest: null,
			pullRequestProgress: null,
			error: new Error("Content ratio 0.21 below 0.5 | blocking\nstack line"),
		},
	];
}

function createReport(overrides: Partial<RunReport> = {}): RunReport {
	return {
		targetLanguage: "pt-br",
		abortMessage: null,
		statistics: createStatistics(),
		results: createResults(),
		failOpenByReason: NO_FAIL_OPEN,
		patFallbackCount: 0,
		changesRequestedPullRequests: [],
		...overrides,
	};
}

describe("buildRunSummary", () => {
	test("reports file counts, backlog, PR actions, tokens and cost", () => {
		const { markdown } = buildRunSummary(createReport());

		expect(markdown).toContain("## Translation run: `pt-br`");
		expect(markdown).toContain("| Failed | 1 |");
		expect(markdown).toContain("| Left for a later run (`MAX_FILES_PER_RUN`) | 4 |");
		expect(markdown).toContain("| Held by the open-PR ceiling (`MAX_OPEN_TRANSLATION_PRS`) | 1 |");
		expect(markdown).toContain("**Pull requests:** 1 opened, 1 updated.");
		expect(markdown).toContain("12,345 prompt, 6,789 completion. **Cost:** $0.0123.");
		expect(markdown).toContain("- Opened [#1](https://github.com/test/test/pull/1): `file-1.md`");
		expect(markdown).toContain("- Updated [#2](https://github.com/test/test/pull/2): `file-2.md`");
		expect(markdown).toContain("| `headingCapitalization` | 2 |");
	});

	test("lists a failed file with the first line of its error, pipes escaped", () => {
		const { markdown } = buildRunSummary(createReport());

		expect(markdown).toContain("| `file-3.md` | Content ratio 0.21 below 0.5 \\| blocking |");
		expect(markdown).not.toContain("stack line");
	});

	test("warns once per failed file", () => {
		const { warnings } = buildRunSummary(createReport());

		expect(warnings).toEqual([
			"::warning title=Translation failed::file-3.md: Content ratio 0.21 below 0.5 | blocking",
		]);
	});

	test("shows why the run stopped early", () => {
		const { markdown } = buildRunSummary(
			createReport({
				abortMessage: "Workflow terminated: 5 consecutive failures exceeded threshold of 5",
			}),
		);

		expect(markdown).toContain(
			"> Run stopped early: Workflow terminated: 5 consecutive failures exceeded threshold of 5",
		);
	});

	test("reports PAT fallbacks and fail-opens, warning only about the fail-opens", () => {
		const { markdown, warnings } = buildRunSummary(
			createReport({
				patFallbackCount: 2,
				failOpenByReason: { ...NO_FAIL_OPEN, [FAIL_OPEN_REASONS.languageDetectionShortContent]: 3 },
			}),
		);

		expect(markdown).toContain("- PAT fallback after a 403 from the App token: 2 calls");
		expect(markdown).toContain("- Discovery fail-open, `languageDetectionShortContent`: 3 files");
		expect(warnings).toEqual([
			"::warning title=Translation failed::file-3.md: Content ratio 0.21 below 0.5 | blocking",
			"::warning title=Discovery fail-open::3 files stayed queued after a check failed; see the step summary",
		]);
	});

	test("lists open PRs waiting on requested changes", () => {
		const { markdown } = buildRunSummary(
			createReport({
				changesRequestedPullRequests: [
					{
						number: 1183,
						url: "https://github.com/reactjs/pt-br.react.dev/pull/1183",
						title: "Tradução de `react-labs.md`",
					},
				],
			}),
		);

		expect(markdown).toContain(
			"- [#1183](https://github.com/reactjs/pt-br.react.dev/pull/1183) Tradução de `react-labs.md`",
		);
	});

	test("says so when the requested-changes lookup failed", () => {
		const { markdown } = buildRunSummary(createReport({ changesRequestedPullRequests: null }));

		expect(markdown).toContain("Couldn't check open translation PRs for requested changes");
	});

	test("omits empty sections and reports missing cost for a quiet run", () => {
		const { markdown, warnings } = buildRunSummary(
			createReport({
				results: [],
				statistics: createStatistics({
					successCount: 0,
					failureCount: 0,
					totalCount: 0,
					totalEstimatedCostUsd: null,
					advisoryIssuesByGuardId: {},
				}),
			}),
		);

		expect(markdown).toContain("**Cost:** not reported.");
		expect(markdown).not.toContain("### ");
		expect(warnings).toEqual([]);
	});

	test("escapes newlines and percent signs in warning messages", () => {
		const { warnings } = buildRunSummary(
			createReport({
				results: [{ ...createResult(1), error: new Error("100% of 3 segments dropped") }],
			}),
		);

		expect(warnings).toEqual([
			"::warning title=Translation failed::file-1.md: 100%25 of 3 segments dropped",
		]);
	});
});
