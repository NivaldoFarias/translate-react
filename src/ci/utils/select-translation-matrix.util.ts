import { z } from "zod";

import type { TranslationMatrixEntry } from "@/ci/services/upstream/types";

import { upstreamLocaleConfigSchema } from "@/ci/services/upstream/types";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

/** Zod schema for one translation matrix row passed between workflows */
export const translationMatrixEntrySchema = upstreamLocaleConfigSchema.extend({
	fork_owner: z.string().min(1),
	upstream_sha: z.string().min(1),
});

/** Where the selected translation matrix came from */
export type TranslationMatrixSource = "polled" | "resolved";

/** Matrix chosen for the `Sync & Translate` job */
export interface SelectedTranslationMatrix {
	/** `polled` when `matrix_json` was supplied by `poll.yml`, otherwise `resolved` */
	source: TranslationMatrixSource;

	/** Validated matrix rows */
	matrix: TranslationMatrixEntry[];

	/** Whether the translation job should run */
	hasMatrix: boolean;
}

/** Raw matrix inputs from the `prepare-matrix` job */
export interface SelectTranslationMatrixOptions {
	/** `inputs.matrix_json` from `workflow_call` (empty on manual dispatch) */
	polledMatrixJson?: string;

	/** `matrix` output of the manual resolve step (empty when that step was skipped) */
	resolvedMatrixJson?: string;
}

/**
 * Parses and validates a JSON translation matrix.
 *
 * @param raw JSON array string
 * @param source Label used in error messages
 *
 * @returns Validated matrix rows
 *
 * @throws {ApplicationError} When `raw` is not valid JSON or rows fail validation
 */
function parseTranslationMatrix(raw: string, source: TranslationMatrixSource) {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new ApplicationError(
			`The ${source} translation matrix is not valid JSON`,
			ErrorCode.FormatValidationFailed,
			"selectTranslationMatrix",
			{ source, error: error instanceof Error ? error.message : String(error) },
		);
	}

	const result = z.array(translationMatrixEntrySchema).safeParse(parsed);

	if (!result.success) {
		throw new ApplicationError(
			`The ${source} translation matrix has invalid rows`,
			ErrorCode.FormatValidationFailed,
			"selectTranslationMatrix",
			{ source, issues: result.error.issues },
		);
	}

	return result.data satisfies TranslationMatrixEntry[];
}

/**
 * Picks the translation matrix for `workflow.yml`.
 *
 * Keys on whether `matrix_json` is non-empty rather than `github.event_name`, which in a called
 * workflow reflects the caller's event (`schedule`/`workflow_dispatch`), never `workflow_call`.
 *
 * @param options Polled and resolved matrix JSON strings
 *
 * @returns Selected matrix, its source, and whether translation should run
 *
 * @throws {ApplicationError} When a supplied `matrix_json` is invalid or empty, or when no
 * matrix source is available at all
 */
export function selectTranslationMatrix(options: SelectTranslationMatrixOptions) {
	const polled = (options.polledMatrixJson ?? "").trim();

	if (polled.length > 0) {
		const matrix = parseTranslationMatrix(polled, "polled");

		if (matrix.length === 0) {
			throw new ApplicationError(
				"matrix_json was supplied but contains no rows",
				ErrorCode.FormatValidationFailed,
				"selectTranslationMatrix",
				{ source: "polled" },
			);
		}

		return { source: "polled", matrix, hasMatrix: true } satisfies SelectedTranslationMatrix;
	}

	const resolved = (options.resolvedMatrixJson ?? "").trim();

	if (resolved.length === 0) {
		throw new ApplicationError(
			"No translation matrix available: matrix_json is empty and the manual resolve step produced no output",
			ErrorCode.InitializationError,
			"selectTranslationMatrix",
		);
	}

	const matrix = parseTranslationMatrix(resolved, "resolved");

	return {
		source: "resolved",
		matrix,
		hasMatrix: matrix.length > 0,
	} satisfies SelectedTranslationMatrix;
}
