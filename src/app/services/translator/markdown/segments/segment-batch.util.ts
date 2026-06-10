import type { SegmentBatchRequestItem } from "@/app/services/translator/translator-segment-batch.schema";

import type { TranslatableSegment } from "./types";

/** Estimated JSON wrapper tokens for a segment batch user message */
const SEGMENT_BATCH_JSON_OVERHEAD_TOKENS = 32;

/**
 * Estimates tokens for a segment batch request envelope serialized as JSON.
 *
 * @param items Batch items to estimate
 * @param estimateTokens Token estimator (typically `ChunksManager.estimateTokenCount`)
 *
 * @returns Estimated input tokens for the batch user message
 */
export function estimateSegmentBatchRequestTokens(
	items: readonly SegmentBatchRequestItem[],
	estimateTokens: (text: string) => number,
) {
	const payload = JSON.stringify({ items });
	return estimateTokens(payload);
}

/**
 * Packs translate-kind segments into token-budgeted batches in document order.
 *
 * @param segments Segments to pack (typically translate-kind only)
 * @param estimateTokens Token estimator from `ChunksManager`
 * @param maxBatchTokens Maximum estimated tokens per batch request
 *
 * @returns Ordered batches of request items
 *
 * @example
 * ```typescript
 * const batches = packSegmentsIntoBatches(
 *   segments,
 *   (text) => chunksManager.estimateTokenCount(text),
 *   chunksManager.getMarkdownChunkSplitterTokenBudget(),
 * );
 * ```
 */
export function packSegmentsIntoBatches(
	segments: readonly TranslatableSegment[],
	estimateTokens: (text: string) => number,
	maxBatchTokens: number,
) {
	const batches: SegmentBatchRequestItem[][] = [];
	let currentBatch: SegmentBatchRequestItem[] = [];
	let currentTokens = SEGMENT_BATCH_JSON_OVERHEAD_TOKENS;

	for (const segment of segments) {
		const item: SegmentBatchRequestItem = {
			segmentId: segment.id,
			source: segment.sourceText,
			heading: segment.context?.heading,
		};
		const itemTokens = estimateSegmentBatchRequestTokens([item], estimateTokens);
		const batchWouldExceedBudget =
			currentBatch.length > 0 && currentTokens + itemTokens > maxBatchTokens;

		if (batchWouldExceedBudget) {
			batches.push(currentBatch);
			currentBatch = [];
			currentTokens = SEGMENT_BATCH_JSON_OVERHEAD_TOKENS;
		}

		currentBatch.push(item);
		currentTokens += itemTokens;
	}

	if (currentBatch.length > 0) {
		batches.push(currentBatch);
	}

	return batches;
}

/**
 * Splits a segment batch in half for retry after completion-token truncation.
 *
 * @param items Batch items that exceeded the completion budget
 *
 * @returns Two non-empty halves when `items.length` is greater than one
 */
export function splitSegmentBatchInHalf(items: readonly SegmentBatchRequestItem[]) {
	const midpoint = Math.ceil(items.length / 2);
	return [items.slice(0, midpoint), items.slice(midpoint)] as const;
}
