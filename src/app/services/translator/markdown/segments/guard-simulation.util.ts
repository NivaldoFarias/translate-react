import type { FixtureCorpusMetrics, GuardSimulationRow, TranslatableSegment } from "./types";

import { collectPostTranslationValidationIssues } from "../../validation/guards";

import { extractSegments, filterTranslatableSegments } from "./extract-segments.util";
import { mockTranslateSegments, reinsertSegments } from "./reinsert-segments.util";

/** Guards targeted by v0.2.6 structural failure analysis in issue #57 */
const STRUCTURAL_GUARD_IDS = new Set([
	"markdownLinksPreserved",
	"fenceFunctionIdentifiers",
	"fenceJsxStaticText",
	"contentRatio",
]);

/**
 * Simulates a bad full-body translation that corrupts links and fence identifiers.
 *
 * @param source Original markdown
 *
 * @returns Synthetic corrupted document for guard comparison
 */
export function simulateBadFullBodyTranslation(source: string) {
	let corrupted = source;

	corrupted = corrupted.replace(/\]\(([^)]+)\)/g, "](broken-url)");
	corrupted = corrupted.replace(/\bfunction\s+([A-Za-z_$][\w$]*)/g, "function renamed_$1");
	corrupted = corrupted.replace(/>([^<{]+)</g, ">[translated]<");

	return corrupted;
}

/**
 * Simulates segment-only translation where frozen regions cannot be corrupted.
 *
 * @param source Original markdown
 * @param segments Extracted segments
 *
 * @returns Document with only translate segments modified
 */
export function simulateSegmentOnlyTranslation(
	source: string,
	segments: readonly TranslatableSegment[],
) {
	const translations: Record<string, string> = {};

	for (const segment of filterTranslatableSegments(segments)) {
		translations[segment.id] = `${segment.sourceText}ü`;
	}

	return reinsertSegments(source, translations, segments);
}

/**
 * Builds guard simulation rows for a fixture comparing full-body vs segment freeze.
 *
 * @param source Fixture markdown
 *
 * @returns Per-guard simulation rows for structural guards
 */
export function simulateGuardOutcomes(source: string): GuardSimulationRow[] {
	const badFullBody = simulateBadFullBodyTranslation(source);
	const extraction = extractSegments(source);
	const segmentOnly = simulateSegmentOnlyTranslation(source, extraction.segments);

	const fullBodyIssues = collectPostTranslationValidationIssues(source, badFullBody);
	const segmentIssues = collectPostTranslationValidationIssues(source, segmentOnly);

	const fullBodyIds = new Set(fullBodyIssues.map((issue) => issue.guardId));
	const segmentIds = new Set(segmentIssues.map((issue) => issue.guardId));

	const rows: GuardSimulationRow[] = [];

	for (const guardId of STRUCTURAL_GUARD_IDS) {
		rows.push({
			guardId,
			firesOnSimulatedBadFullBody: fullBodyIds.has(guardId),
			preventedBySegmentFreeze: fullBodyIds.has(guardId) && !segmentIds.has(guardId),
		});
	}

	return rows;
}

/**
 * Runs the full spike metrics pipeline for one fixture id and source.
 *
 * @param fixtureId Scenario id (S1–S10)
 * @param source Fixture markdown
 *
 * @returns Corpus metrics row for the spike table
 */
export function analyzeFixture(fixtureId: string, source: string): FixtureCorpusMetrics {
	const extraction = extractSegments(source);
	const { ok } = identityRoundTripFromExtraction(source, extraction.segments);
	const translateSegments = filterTranslatableSegments(extraction.segments);
	const policySegments = extraction.segments.filter((segment) => segment.kind === "policy");

	return {
		fixtureId,
		segmentCount: extraction.segments.length,
		translateSegmentCount: translateSegments.length,
		policySegmentCount: policySegments.length,
		translatableCharCount: translateSegments.reduce(
			(total, segment) => total + segment.sourceText.length,
			0,
		),
		bodyCharCount: extraction.body.length,
		identityRoundTrip: ok,
		parseWarnings: extraction.parseWarnings,
		guardSimulation: simulateGuardOutcomes(source),
	};
}

/**
 * Identity round-trip helper when extraction was already computed.
 *
 * @param source Original markdown
 * @param segments Pre-extracted segments
 *
 * @returns Round-trip success flag
 */
function identityRoundTripFromExtraction(source: string, segments: readonly TranslatableSegment[]) {
	const translations: Record<string, string> = {};

	for (const segment of filterTranslatableSegments(segments)) {
		translations[segment.id] = segment.sourceText;
	}

	const output = reinsertSegments(source, translations, segments);
	const ok = output.replace(/\r\n/g, "\n") === source.replace(/\r\n/g, "\n");

	return { ok, output };
}

export { mockTranslateSegments };
