import type { TranslatableSegment } from "@/app/services/translator/markdown/segments/types";

import { collectPostTranslationValidationIssues } from "@/app/services/translator/validation/guards";
import {
	extractSegments,
	filterTranslatableSegments,
} from "@/app/services/translator/markdown/segments/extract-segments.util";
import { reinsertSegments } from "@/app/services/translator/markdown/segments/reinsert-segments.util";

/** One row in the guard simulation table for a fixture */
export interface GuardSimulationRow {
	readonly guardId: string;
	readonly firesOnSimulatedBadFullBody: boolean;
	readonly preventedBySegmentFreeze: boolean;
}

const STRUCTURAL_GUARD_IDS = new Set([
	"markdownLinksPreserved",
	"fenceFunctionIdentifiers",
	"fenceJsxStaticText",
	"contentRatio",
]);

function simulateBadFullBodyTranslation(source: string) {
	let corrupted = source;

	corrupted = corrupted.replace(/\]\(([^)]+)\)/g, "](broken-url)");
	corrupted = corrupted.replace(/\bfunction\s+([A-Za-z_$][\w$]*)/g, "function renamed_$1");
	corrupted = corrupted.replace(/>([^<{]+)</g, ">[translated]<");

	return corrupted;
}

function simulateSegmentOnlyTranslation(
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
 * Builds guard simulation rows comparing full-body corruption vs segment freeze.
 *
 * @param source Fixture markdown
 *
 * @returns Per-guard simulation rows for structural guards
 */
export function simulateGuardOutcomes(source: string): GuardSimulationRow[] {
	const badFullBody = simulateBadFullBodyTranslation(source);
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- fixture helper uses full-document extraction
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
