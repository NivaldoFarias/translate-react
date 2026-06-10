import { compareCommentExtractionMethods } from "./fence-comments.util";
import { SEGMENT_INTEGRATION_ANALYSIS } from "./integration-analysis.util";
import { SEGMENT_SPIKE_TOOLING_NOTE } from "./parse-mdx.util";
import { formatCorpusTable, loadSpikeFixture, runSpikeCorpus } from "./spike-corpus.util";

/**
 * Builds the issue #57 spike write-up body for posting as a GitHub comment.
 *
 * @returns Markdown write-up with tooling note, fixture table, guard simulation, and recommendation
 */
export function buildSpikeWriteupComment() {
	const metrics = runSpikeCorpus();
	const corpusTable = formatCorpusTable(metrics);
	const s5Match = /```js\n([\s\S]*?)```/.exec(loadSpikeFixture("S5"));
	const s5Fence = s5Match?.[1] ?? "";
	const commentComparison = compareCommentExtractionMethods(s5Fence);
	const guardSummary = metrics
		.map((row) => {
			const prevented = row.guardSimulation
				.filter((sim) => sim.preventedBySegmentFreeze)
				.map((sim) => sim.guardId);
			return `**${row.fixtureId}**: ${prevented.length > 0 ? prevented.join(", ") : "none"}`;
		})
		.join("\n");

	const { recommendation, failureModes, touchpoints } = SEGMENT_INTEGRATION_ANALYSIS;

	return `## Spike write-up: AST-based segment extraction

### Tooling choice

${SEGMENT_SPIKE_TOOLING_NOTE}

\`@mdx-js/mdx\` compile was evaluated and deferred: it targets JS output, not mdast walks with source positions for offset reinsertion.

### Fixture corpus (identity reinsert, no LLM)

${corpusTable}

**S9 note:** chunk-sized \`react-labs-view-transitions-activity-and-more.md\` passes identity round-trip when segments use source slices (494 segments; translatable ratio ~${(
		(metrics.find((row) => row.fixtureId === "S9")?.translatableCharCount ?? 0) /
		(metrics.find((row) => row.fixtureId === "S9")?.bodyCharCount ?? 1)
	).toFixed(2)}).

### Fence comment sub-spike (S5)

| Method | Comment count |
|--------|---------------|
| TypeScript parser | ${commentComparison.parserCount} |
| Regex baseline | ${commentComparison.regexCount} |

Parser found ${commentComparison.parserCount} comments vs ${commentComparison.regexCount} regex matches on S5 fence body.

### Guard simulation (v0.2.6 structural failures)

Simulated bad full-body translation vs segment-only edits. Guards prevented by segment freeze:

${guardSummary}

| Guard | pt-br/ru failure relevance |
|-------|----------------------------|
| markdownLinksPreserved | conferences, upgrade guide |
| fenceFunctionIdentifiers | react-19, eslint pages |
| fenceJsxStaticText | JSX demo fences (#45) |
| contentRatio | combo failures when structure breaks |

### Failure modes documented

${failureModes.map((item) => `- ${item}`).join("\n")}

### Integration touchpoints

- **ChunksManager:** ${touchpoints.chunksManager}
- **Maintainer feedback:** ${touchpoints.maintainerFeedback}
- **Guards:** ${touchpoints.guards}
- **TranslatorService:** ${touchpoints.translatorService}

### Recommendation: **${recommendation.decision.toUpperCase()}** (MVP t-shirt: **${recommendation.tShirtSize}**)

**MVP scope:** ${recommendation.mvpScope}

**Effort:** ${recommendation.effortNotes.join("; ")}

**Risks:** ${recommendation.riskNotes.join("; ")}

**Defer if:** ${recommendation.deferTriggers.join("; ")}

Follow-up implementation issue to be opened for hybrid MVP behind a feature flag.`;
}
