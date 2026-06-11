import { describe, expect, test } from "bun:test";

import {
	analyzeSegmentBatchIdMismatch,
	isPartialSegmentBatchRetryEligible,
	segmentBatchIdsMatch,
} from "@/app/services/translator/llm/segment-batch-id-match.util";

describe("segment-batch-id-match.util", () => {
	test("segmentBatchIdsMatch returns true when ids match exactly", () => {
		const batchItems = [
			{ segmentId: "root/paragraph#0", source: "Hello" },
			{ segmentId: "root/paragraph#1", source: "World" },
		];

		expect(
			segmentBatchIdsMatch(batchItems, [
				{ segmentId: "root/paragraph#0" },
				{ segmentId: "root/paragraph#1" },
			]),
		).toBe(true);
	});

	test("analyzeSegmentBatchIdMismatch reports missing and extra ids", () => {
		const batchItems = [
			{ segmentId: "a#0", source: "one" },
			{ segmentId: "b#0", source: "two" },
		];

		const diagnostics = analyzeSegmentBatchIdMismatch(batchItems, [
			{ segmentId: "a#0" },
			{ segmentId: "c#0" },
		]);

		expect(diagnostics.requestedCount).toBe(2);
		expect(diagnostics.receivedItemCount).toBe(2);
		expect(diagnostics.uniqueReceivedCount).toBe(2);
		expect(diagnostics.missingIds).toEqual(["b#0"]);
		expect(diagnostics.extraIds).toEqual(["c#0"]);
		expect(diagnostics.duplicateResponseIds).toEqual([]);
	});

	test("isPartialSegmentBatchRetryEligible returns true for dropped ids only", () => {
		const diagnostics = analyzeSegmentBatchIdMismatch(
			[
				{ segmentId: "a#0", source: "one" },
				{ segmentId: "b#0", source: "two" },
			],
			[{ segmentId: "a#0" }],
		);

		expect(isPartialSegmentBatchRetryEligible(diagnostics)).toBe(true);
	});

	test("isPartialSegmentBatchRetryEligible returns false when extra ids are present", () => {
		const diagnostics = analyzeSegmentBatchIdMismatch(
			[{ segmentId: "a#0", source: "one" }],
			[{ segmentId: "b#0" }],
		);

		expect(isPartialSegmentBatchRetryEligible(diagnostics)).toBe(false);
	});

	test("analyzeSegmentBatchIdMismatch reports duplicate response ids", () => {
		const batchItems = [
			{ segmentId: "a#0", source: "one" },
			{ segmentId: "b#0", source: "two" },
		];

		const diagnostics = analyzeSegmentBatchIdMismatch(batchItems, [
			{ segmentId: "a#0" },
			{ segmentId: "a#0" },
		]);

		expect(diagnostics.missingIds).toEqual(["b#0"]);
		expect(diagnostics.extraIds).toEqual([]);
		expect(diagnostics.duplicateResponseIds).toEqual(["a#0"]);
		expect(segmentBatchIdsMatch(batchItems, [{ segmentId: "a#0" }, { segmentId: "a#0" }])).toBe(
			false,
		);
	});
});
