/**
 * Identifiers for discovery paths that fail open toward more translation work.
 *
 * Used in structured logs and end-of-discovery inventory summaries (#40).
 */
export const FAIL_OPEN_REASONS = {
	prValidityEvaluationError: "prValidityEvaluationError",
	languageDetectionEmptyContent: "languageDetectionEmptyContent",
	languageDetectionShortContent: "languageDetectionShortContent",
	languageDetectionCldUnreliable: "languageDetectionCldUnreliable",
} as const;

/** Union of {@link FAIL_OPEN_REASONS} values */
export type FailOpenReasonId = (typeof FAIL_OPEN_REASONS)[keyof typeof FAIL_OPEN_REASONS];
