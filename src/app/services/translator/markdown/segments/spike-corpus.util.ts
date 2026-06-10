import { readFileSync } from "node:fs";
import { join } from "node:path";

import { analyzeFixture } from "./guard-simulation.util";

import type { FixtureCorpusMetrics } from "./types";

const PROJECT_ROOT = join(import.meta.dir, "../../../../../../");
const FIXTURE_DIR = join(PROJECT_ROOT, "tests/fixtures/segment-extraction");
const LARGE_FIXTURE = join(
	PROJECT_ROOT,
	"tests/fixtures/md/react-labs-view-transitions-activity-and-more.md",
);

/** Registry of spike fixtures S1–S10 with load paths */
export const SPIKE_FIXTURE_REGISTRY = [
	{ id: "S1", file: "s1-baseline-prose.md" },
	{ id: "S2", file: "s2-links-anchors.md" },
	{ id: "S3", file: "s3-fence-function-identifiers.md" },
	{ id: "S4", file: "s4-fence-jsx-static-text.md" },
	{ id: "S5", file: "s5-fence-comments-only.md" },
	{ id: "S6", file: "s6-mdx-components-slug.md" },
	{ id: "S7", file: "s7-frontmatter-keys.md" },
	{ id: "S8", file: "s8-duplicate-sentence.md" },
	{ id: "S9", file: "react-labs-view-transitions-activity-and-more.md", external: true },
	{ id: "S10", file: "s10-maintainer-feedback-shape.md" },
] as const;

/**
 * Loads a spike fixture by registry entry id.
 *
 * @param fixtureId Scenario id such as `S1`
 *
 * @returns Raw markdown source
 */
export function loadSpikeFixture(fixtureId: string) {
	const entry = SPIKE_FIXTURE_REGISTRY.find((item) => item.id === fixtureId);
	if (!entry) {
		throw new Error(`Unknown spike fixture: ${fixtureId}`);
	}

	const path = entry.id === "S9" ? LARGE_FIXTURE : join(FIXTURE_DIR, entry.file);

	return readFileSync(path, "utf8");
}

/**
 * Runs corpus analysis for all registered spike fixtures.
 *
 * @returns Metrics rows for S1–S10
 */
export function runSpikeCorpus(): FixtureCorpusMetrics[] {
	return SPIKE_FIXTURE_REGISTRY.map((entry) => {
		const source = loadSpikeFixture(entry.id);
		return analyzeFixture(entry.id, source);
	});
}

/**
 * Formats corpus metrics as a markdown table for the issue #57 write-up.
 *
 * @param metrics Corpus rows from {@link runSpikeCorpus}
 *
 * @returns Markdown table string
 */
export function formatCorpusTable(metrics: readonly FixtureCorpusMetrics[]) {
	const header =
		"| ID | Segments | Translate chars | Body chars | Ratio | Identity | Warnings |\n|----|----------|-----------------|------------|-------|----------|----------|";

	const rows = metrics.map((row) => {
		const ratio =
			row.bodyCharCount === 0
				? "n/a"
				: (row.translatableCharCount / row.bodyCharCount).toFixed(2);
		const warnings =
			row.parseWarnings.length === 0 ? "none" : row.parseWarnings.join("; ");

		return `| ${row.fixtureId} | ${row.segmentCount} (${row.translateSegmentCount}t/${row.policySegmentCount}p) | ${row.translatableCharCount} | ${row.bodyCharCount} | ${ratio} | ${row.identityRoundTrip ? "pass" : "fail"} | ${warnings} |`;
	});

	return [header, ...rows].join("\n");
}
