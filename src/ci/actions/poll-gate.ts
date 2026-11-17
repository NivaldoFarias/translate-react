/**
 * Decides whether [`.github/workflows/poll.yml`](../../.github/workflows/poll.yml) starts translation
 * and writes a `$GITHUB_STEP_SUMMARY` describing the poll.
 *
 * Reads `HAS_CHANGES`, `MATRIX_JSON`, `EVENT_NAME`, `DRY_RUN`, and `SCHEDULED_TRANSLATION_ENABLED`
 * from the environment and writes `dispatch` / `reason` to `GITHUB_OUTPUT`.
 *
 * @example
 * ```bash
 * HAS_CHANGES=true MATRIX_JSON='[...]' SCHEDULED_TRANSLATION_ENABLED=true bun run ci:poll-gate
 * ```
 */

import { appendFileSync } from "node:fs";

import { writeCiWorkflowOutput } from "@/ci/utils/github-output.util";
import { buildPollStepSummary, resolveTranslationDispatch } from "@/ci/utils/poll-gate.util";
import { selectTranslationMatrix } from "@/ci/utils/select-translation-matrix.util";
import { createLogger } from "@/shared/utils/create-logger.util";

const logger = createLogger({ level: "info", logToConsole: true }).child({
	component: "poll-gate",
});

const hasChanges = import.meta.env["HAS_CHANGES"] === "true";

const matrix =
	hasChanges ?
		selectTranslationMatrix({ polledMatrixJson: import.meta.env["MATRIX_JSON"] }).matrix
	:	[];

const decision = resolveTranslationDispatch({
	hasChanges,
	scheduledTranslationEnabled: import.meta.env["SCHEDULED_TRANSLATION_ENABLED"],
	dryRun: import.meta.env["DRY_RUN"] === "true",
});

logger.info({ ...decision, langs: matrix.map((row) => row.lang) }, "Translation dispatch decided");

writeCiWorkflowOutput("dispatch", decision.dispatch ? "true" : "false");
writeCiWorkflowOutput("reason", decision.reason);

const summaryPath = import.meta.env["GITHUB_STEP_SUMMARY"];

if (summaryPath) {
	appendFileSync(
		summaryPath,
		buildPollStepSummary({ eventName: import.meta.env["EVENT_NAME"] ?? "", matrix, decision }),
	);
} else {
	logger.warn("GITHUB_STEP_SUMMARY is not set; skipping step summary");
}
