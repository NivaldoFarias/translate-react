/**
 * Identifiers for discovery paths that fail open toward more translation work.
 *
 * Used in structured logs and end-of-discovery inventory summaries (#40).
 */
export const FAIL_OPEN_REASONS = {
	prValidityEvaluationError: "prValidityEvaluationError",
	languageDetectionEmptyContent: "languageDetectionEmptyContent",
	languageDetectionShortContent: "languageDetectionShortContent",
	languageDetectionCldError: "languageDetectionCldError",
} as const;

export type FailOpenReasonId = (typeof FAIL_OPEN_REASONS)[keyof typeof FAIL_OPEN_REASONS];
