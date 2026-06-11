import type {
	SegmentBatchRequestItem,
	SegmentBatchTranslationItem,
} from "@/app/services/translator/translator-segment-batch.schema";

/** Opaque segment id sent to the LLM instead of long mdast paths */
export type OpaqueSegmentBatchId = `s${number}`;

/**
 * Builds a short opaque segment id for one position in a batch request.
 *
 * @param index Zero-based position in the current batch payload
 *
 * @returns Opaque id such as `s0` or `s12`
 */
export function encodeOpaqueSegmentBatchId(index: number): OpaqueSegmentBatchId {
	return `s${index}`;
}

/**
 * Rewrites a segment batch request to use opaque ids while preserving mdast paths internally.
 *
 * @param batchItems Real segment batch items in document order
 *
 * @returns LLM payload items and a lookup from opaque id to real segment id
 */
export function buildOpaqueSegmentBatchPayload(batchItems: readonly SegmentBatchRequestItem[]) {
	const realSegmentIdByOpaqueId = new Map<OpaqueSegmentBatchId, string>();

	const llmItems = batchItems.map((item, index) => {
		const opaqueId = encodeOpaqueSegmentBatchId(index);
		realSegmentIdByOpaqueId.set(opaqueId, item.segmentId);

		return {
			...item,
			segmentId: opaqueId,
		};
	});

	return { llmItems, realSegmentIdByOpaqueId };
}

/**
 * Maps opaque segment ids from an LLM response back to real mdast segment ids.
 *
 * @param items Parsed response rows with opaque ids
 * @param realSegmentIdByOpaqueId Lookup built by {@link buildOpaqueSegmentBatchPayload}
 *
 * @returns Response rows addressed by real segment ids
 */
export function remapOpaqueSegmentBatchResponseItems(
	items: readonly SegmentBatchTranslationItem[],
	realSegmentIdByOpaqueId: ReadonlyMap<OpaqueSegmentBatchId, string>,
) {
	return items.map((item) => ({
		segmentId:
			realSegmentIdByOpaqueId.get(item.segmentId as OpaqueSegmentBatchId) ?? item.segmentId,
		translated: item.translated,
	}));
}
