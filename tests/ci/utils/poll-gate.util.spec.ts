import { describe, expect, test } from "bun:test";

import type { TranslationMatrixEntry } from "@/ci/services/upstream/types";

import { buildPollStepSummary, resolveTranslationDispatch } from "@/ci/utils/poll-gate.util";

const PT_BR_ROW: TranslationMatrixEntry = {

	scheduled: false,
	lang: "pt-br",
	upstream_owner: "reactjs",
	upstream_name: "pt-br.react.dev",
	fork_name: "pt-br.react.dev",
	fork_owner: "example",
	translation_guidelines_file: "GLOSSARY.md",
	upstream_sha: "abc123",
};

describe("resolveTranslationDispatch", () => {
	test("does not dispatch without upstream changes", () => {
		expect(
			resolveTranslationDispatch({
				hasChanges: false,
				scheduledTranslationEnabled: "true",
				dryRun: false,
			}),
		).toEqual({ dispatch: false, reason: "No upstream changes detected" });
	});

	test("does not dispatch when SCHEDULED_TRANSLATION_ENABLED is unset", () => {
		const decision = resolveTranslationDispatch({ hasChanges: true, dryRun: false });

		expect(decision.dispatch).toBe(false);
		expect(decision.reason).toContain("SCHEDULED_TRANSLATION_ENABLED is unset");
	});

	test("does not dispatch when SCHEDULED_TRANSLATION_ENABLED is blank", () => {
		const decision = resolveTranslationDispatch({
			hasChanges: true,
			scheduledTranslationEnabled: "",
			dryRun: false,
		});

		expect(decision.dispatch).toBe(false);
		expect(decision.reason).toContain("is unset");
	});

	test.each(["false", "TRUE", "1", "yes", " true"])(
		"does not dispatch when SCHEDULED_TRANSLATION_ENABLED is %p",
		(value) => {
			const decision = resolveTranslationDispatch({
				hasChanges: true,
				scheduledTranslationEnabled: value,
				dryRun: false,
			});

			expect(decision.dispatch).toBe(false);
			expect(decision.reason).toContain(`"${value}"`);
		},
	);

	test("does not dispatch when dry_run is set", () => {
		expect(
			resolveTranslationDispatch({
				hasChanges: true,
				scheduledTranslationEnabled: "true",
				dryRun: true,
			}),
		).toEqual({ dispatch: false, reason: "Gated off: dry_run input was set" });
	});

	test("dispatches when upstream changed and the variable is exactly true", () => {
		expect(
			resolveTranslationDispatch({
				hasChanges: true,
				scheduledTranslationEnabled: "true",
				dryRun: false,
			}).dispatch,
		).toBe(true);
	});
});

describe("buildPollStepSummary", () => {
	test("lists changed locales with upstream SHAs and the dispatch decision", () => {
		const summary = buildPollStepSummary({
			eventName: "schedule",
			matrix: [PT_BR_ROW],
			decision: { dispatch: true, reason: "Upstream changed and scheduled translation is enabled" },
		});

		expect(summary).toContain("- **Trigger:** `schedule`");
		expect(summary).toContain("- **Translation:** dispatched");
		expect(summary).toContain("| `pt-br` | `reactjs/pt-br.react.dev` | `abc123` |");
	});

	test("reports gated runs and empty matrices", () => {
		const summary = buildPollStepSummary({
			eventName: "workflow_dispatch",
			matrix: [],
			decision: { dispatch: false, reason: "No upstream changes detected" },
		});

		expect(summary).toContain("- **Translation:** not dispatched");
		expect(summary).toContain("- **Reason:** No upstream changes detected");
		expect(summary).toContain("No changed locales.");
	});
});
