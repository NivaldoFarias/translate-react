export { classifyNode, classificationRuleForNode } from "./classify.util";
export {
	buildNodePath,
	collectHeadingPlainText,
	isCode,
	isLink,
	isMdxJsxElement,
	isPreserveAncestor,
	isText,
	PRESERVE_ANCESTOR_TYPES,
	sliceAbsoluteSpan,
} from "./mdast-segment.util";
export {
	compareCommentExtractionMethods,
	collectTypeScriptCommentSpans,
	extractFenceCommentSegments,
	isJsLikeFenceLang,
} from "./fence-comments.util";
export {
	extractSegments,
	extractTranslatableBodySegments,
	filterTranslatableSegments,
	sumTranslatableChars,
} from "./extract-segments.util";
export {
	estimateSegmentBatchRequestTokens,
	packSegmentsIntoBatches,
	splitSegmentBatchInHalf,
} from "./segment-batch.util";
export type { SegmentBatchRequestItem } from "./segment-batch.util";
export {
	computeTranslatableCharRatio,
	isSegmentTranslationEligible,
} from "./segment-translation.util";
export {
	analyzeFixture,
	simulateBadFullBodyTranslation,
	simulateGuardOutcomes,
	simulateSegmentOnlyTranslation,
} from "./guard-simulation.util";
export { SEGMENT_INTEGRATION_ANALYSIS } from "./integration-analysis.util";
export { parseMdxToMdast, SEGMENT_SPIKE_TOOLING_NOTE } from "./parse-mdx.util";
export {
	identityRoundTrip,
	mockTranslateSegments,
	normalizeNewlines,
	reinsertSegments,
} from "./reinsert-segments.util";
export {
	formatCorpusTable,
	loadSpikeFixture,
	runSpikeCorpus,
	SPIKE_FIXTURE_REGISTRY,
} from "./spike-corpus.util";
export { buildSpikeWriteupComment } from "./spike-writeup.util";
export { evaluateToolingOnFixture } from "./tooling-eval.util";
export type {
	BodySegmentExtractionResult,
	FixtureCorpusMetrics,
	GuardSimulationRow,
	SegmentContext,
	SegmentExtractionResult,
	SegmentKind,
	SegmentTranslationMap,
	TranslatableSegment,
} from "./types";
