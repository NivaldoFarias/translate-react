import type { SegmentBatchRequestItem } from "@/app/services/translator/translator-segment-batch.schema";

/** One row in a segment batch LLM response used for id-set comparison */
export interface SegmentBatchResponseIdRow {
	readonly segmentId: string;
}

/** Diff between requested segment ids and ids returned by the model */
export interface SegmentBatchIdMismatchDiagnostics {
	readonly requestedCount: number;
	readonly receivedItemCount: number;
	readonly uniqueReceivedCount: number;
	readonly missingIds: string[];
	readonly extraIds: string[];
	readonly duplicateResponseIds: string[];
}

/** Operator-facing follow-ups to consider after analyzing a segment batch id mismatch */
export const SEGMENT_BATCH_ID_MISMATCH_RECOVERY_OPTIONS = [
	"Retry only segmentIds missing from the response (partial follow-up batch)",
	"Cap max segments per batch for more reliable structured JSON from the model",
	"Use opaque short segment ids in the LLM payload instead of long mdast paths",
] as const;

/**
 * Returns segment ids that appear more than once in `segmentIds`.
 *
 * @param segmentIds Response segment ids in model order
 *
 * @returns Unique ids that occurred more than once
 */
function findDuplicateSegmentIds(segmentIds: readonly string[]) {
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const segmentId of segmentIds) {
		if (seen.has(segmentId)) {
			duplicates.add(segmentId);
		}

		seen.add(segmentId);
	}

	return [...duplicates];
}

/**
 * Compares requested segment batch ids to ids returned by the model.
 *
 * @param batchItems Segment batch request items sent to the LLM
 * @param responseItems Parsed response rows (only `segmentId` is required)
 *
 * @returns Missing, extra, and duplicate id diagnostics
 */
export function analyzeSegmentBatchIdMismatch(
	batchItems: readonly SegmentBatchRequestItem[],
	responseItems: readonly SegmentBatchResponseIdRow[],
): SegmentBatchIdMismatchDiagnostics {
	const requestedIds = batchItems.map((item) => item.segmentId);
	const requestedSet = new Set(requestedIds);
	const receivedIds = responseItems.map((item) => item.segmentId);
	const receivedSet = new Set(receivedIds);

	const missingIds = requestedIds.filter((segmentId) => !receivedSet.has(segmentId));
	const extraIds = [...receivedSet].filter((segmentId) => !requestedSet.has(segmentId));

	return {
		requestedCount: requestedIds.length,
		receivedItemCount: receivedIds.length,
		uniqueReceivedCount: receivedSet.size,
		missingIds,
		extraIds,
		duplicateResponseIds: findDuplicateSegmentIds(receivedIds),
	};
}

/**
 * Returns whether the response id set matches the request exactly.
 *
 * @param batchItems Segment batch request items sent to the LLM
 * @param responseItems Parsed response rows
 *
 * @returns `true` when every requested id appears once in the response and no extras exist
 */
export function segmentBatchIdsMatch(
	batchItems: readonly SegmentBatchRequestItem[],
	responseItems: readonly SegmentBatchResponseIdRow[],
) {
	const diagnostics = analyzeSegmentBatchIdMismatch(batchItems, responseItems);

	return (
		diagnostics.requestedCount === diagnostics.uniqueReceivedCount &&
		diagnostics.missingIds.length === 0 &&
		diagnostics.extraIds.length === 0 &&
		diagnostics.duplicateResponseIds.length === 0
	);
}

/**
 * Returns whether a segment batch id mismatch can be recovered by retrying missing ids only.
 *
 * @param diagnostics Id diff from {@link analyzeSegmentBatchIdMismatch}
 *
 * @returns `true` when items were dropped but ids were not rewritten or duplicated
 */
export function isPartialSegmentBatchRetryEligible(diagnostics: SegmentBatchIdMismatchDiagnostics) {
	return (
		diagnostics.missingIds.length > 0 &&
		diagnostics.extraIds.length === 0 &&
		diagnostics.duplicateResponseIds.length === 0
	);
}
