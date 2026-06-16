import { describe, expect, test } from "bun:test";

import {
	buildOpaqueSegmentBatchPayload,
	encodeOpaqueSegmentBatchId,
	remapOpaqueSegmentBatchResponseItems,
} from "@/app/services/translator/llm/segment-batch-opaque-id.util";

describe("segment-batch-opaque-id.util", () => {
	test("encodeOpaqueSegmentBatchId returns s-prefixed indices", () => {
		expect(encodeOpaqueSegmentBatchId(0)).toBe("s0");
		expect(encodeOpaqueSegmentBatchId(12)).toBe("s12");
	});

	test("buildOpaqueSegmentBatchPayload rewrites ids while preserving source text", () => {
		const realId = "root/mdxJsxFlowElement[97]/paragraph[0]/strong[0]/text[1]#0";
		const { llmItems, realSegmentIdByOpaqueId } = buildOpaqueSegmentBatchPayload([
			{ segmentId: realId, source: "React Labs", heading: "Overview" },
		]);

		expect(llmItems).toEqual([{ segmentId: "s0", source: "React Labs", heading: "Overview" }]);
		expect(realSegmentIdByOpaqueId.get("s0")).toBe(realId);
	});

	test("remapOpaqueSegmentBatchResponseItems restores mdast segment ids", () => {
		const realId = "root/mdxJsxFlowElement[97]/paragraph[0]/strong[0]/text[1]#0";
		const { realSegmentIdByOpaqueId } = buildOpaqueSegmentBatchPayload([
			{ segmentId: realId, source: "React Labs" },
		]);

		expect(
			remapOpaqueSegmentBatchResponseItems(
				[{ segmentId: "s0", translated: "React Labs" }],
				realSegmentIdByOpaqueId,
			),
		).toEqual([{ segmentId: realId, translated: "React Labs" }]);
	});
});
