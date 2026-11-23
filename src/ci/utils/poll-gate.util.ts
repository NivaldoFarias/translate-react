import type { TranslationMatrixEntry } from "@/ci/services/upstream/types";

/** Repository variable that must equal `"true"` for `poll.yml` to start translation */
export const SCHEDULED_TRANSLATION_ENABLED_VARIABLE = "SCHEDULED_TRANSLATION_ENABLED";

/** Inputs that decide whether `poll.yml` dispatches `workflow.yml` */
export interface TranslationDispatchInput {
	/** Whether the poll found any changed locale */
	hasChanges: boolean;

	/** Raw `vars.SCHEDULED_TRANSLATION_ENABLED` value (empty or `undefined` when unset) */
	scheduledTranslationEnabled?: string;

	/** Whether the manual `dry_run` input was set */
	dryRun: boolean;
}

/** Whether `poll.yml` dispatches translation, and why */
export interface TranslationDispatchDecision {
	/** `true` only when translation should start */
	dispatch: boolean;

	/** Human-readable reason, written to outputs and the step summary */
	reason: string;
}

/**
 * Decides whether `poll.yml` should call `workflow.yml`.
 *
 * Translation is opt-in: it runs only when upstream changed, the
 * {@link SCHEDULED_TRANSLATION_ENABLED_VARIABLE} repository variable is exactly `"true"`, and
 * `dry_run` was not requested.
 *
 * @param input Poll result, kill-switch value, and dry-run flag
 *
 * @returns Dispatch decision with reason
 */
export function resolveTranslationDispatch(input: TranslationDispatchInput) {
	if (!input.hasChanges) {
		return {
			dispatch: false,
			reason: "No upstream changes detected",
		} satisfies TranslationDispatchDecision;
	}

	if (input.scheduledTranslationEnabled !== "true") {
		const current =
			input.scheduledTranslationEnabled ? `"${input.scheduledTranslationEnabled}"` : "unset";

		return {
			dispatch: false,
			reason: `Gated off: repository variable ${SCHEDULED_TRANSLATION_ENABLED_VARIABLE} is ${current} (must be "true")`,
		} satisfies TranslationDispatchDecision;
	}

	if (input.dryRun) {
		return {
			dispatch: false,
			reason: "Gated off: dry_run input was set",
		} satisfies TranslationDispatchDecision;
	}

	return {
		dispatch: true,
		reason: "Upstream changed and scheduled translation is enabled",
	} satisfies TranslationDispatchDecision;
}

/**
 * Builds the Markdown `$GITHUB_STEP_SUMMARY` for a poll run.
 *
 * @param options Summary inputs
 * @param options.eventName Triggering event (`schedule` or `workflow_dispatch`)
 * @param options.matrix Changed-locale rows from the poll
 * @param options.decision Dispatch decision from {@link resolveTranslationDispatch}
 *
 * @returns Markdown summary
 */
export function buildPollStepSummary(options: {
	eventName: string;
	matrix: TranslationMatrixEntry[];
	decision: TranslationDispatchDecision;
}) {
	const lines = [
		"## Upstream poll",
		"",
		`- **Trigger:** \`${options.eventName || "unknown"}\``,
		`- **Translation:** ${options.decision.dispatch ? "dispatched" : "not dispatched"}`,
		`- **Reason:** ${options.decision.reason}`,
		"",
	];

	if (options.matrix.length === 0) {
		lines.push("No changed locales.");
	} else {
		lines.push("| Locale | Upstream | Upstream SHA |", "| --- | --- | --- |");

		for (const row of options.matrix) {
			lines.push(
				`| \`${row.lang}\` | \`${row.upstream_owner}/${row.upstream_name}\` | \`${row.upstream_sha}\` |`,
			);
		}
	}

	return `${lines.join("\n")}\n`;
}
