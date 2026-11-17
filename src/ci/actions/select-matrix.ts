/**
 * Selects the translation matrix for [`.github/workflows/workflow.yml`](../../.github/workflows/workflow.yml).
 *
 * Reads `POLLED_MATRIX` (`inputs.matrix_json`) and `RESOLVED_MATRIX` (manual resolve output) from
 * the environment and writes `matrix`, `has_matrix`, and `source` to `GITHUB_OUTPUT`. Exits non-zero
 * when a supplied `matrix_json` is invalid or empty.
 *
 * @example
 * ```bash
 * POLLED_MATRIX='[...]' bun run ci:select-matrix
 * ```
 */

import { writeCiWorkflowOutput } from "@/ci/utils/github-output.util";
import { selectTranslationMatrix } from "@/ci/utils/select-translation-matrix.util";
import { createLogger } from "@/shared/utils/create-logger.util";

const logger = createLogger({ level: "info", logToConsole: true }).child({
	component: "select-matrix",
});

const selected = selectTranslationMatrix({
	polledMatrixJson: import.meta.env["POLLED_MATRIX"],
	resolvedMatrixJson: import.meta.env["RESOLVED_MATRIX"],
});

logger.info(
	{
		source: selected.source,
		hasMatrix: selected.hasMatrix,
		langs: selected.matrix.map((row) => row.lang),
	},
	"Translation matrix selected",
);

writeCiWorkflowOutput("source", selected.source);
writeCiWorkflowOutput("has_matrix", selected.hasMatrix ? "true" : "false");
writeCiWorkflowOutput("matrix", JSON.stringify(selected.matrix));
