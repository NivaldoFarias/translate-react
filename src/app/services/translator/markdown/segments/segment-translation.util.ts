/**
 * Returns whether AST segment translation may proceed without falling back to full-body LLM.
 *
 * Parse failures and position warnings indicate unsafe offset reinsertion.
 *
 * @param parseWarnings Warnings collected during {@link extractTranslatableBodySegments}
 *
 * @returns `true` when the segment path is safe to use
 *
 * @example
 * ```typescript
 * const { parseWarnings } = extractTranslatableBodySegments(body);
 * if (!isSegmentTranslationEligible(parseWarnings)) {
 *   // fall back to full-body translation
 * }
 * ```
 */
export function isSegmentTranslationEligible(parseWarnings: readonly string[]) {
	const hasParseFailure = parseWarnings.some((warning) => warning.startsWith("parse failed:"));
	const hasPositionWarnings = parseWarnings.length > 0;

	return !hasParseFailure && !hasPositionWarnings;
}

/**
 * Computes the ratio of translatable segment characters to total body length for debug metrics.
 *
 * @param translatableCharCount Sum of translate-kind segment lengths
 * @param bodyCharCount Full body character count
 *
 * @returns Ratio in `[0, 1]`, or `0` when the body is empty
 */
export function computeTranslatableCharRatio(translatableCharCount: number, bodyCharCount: number) {
	if (bodyCharCount <= 0) {
		return 0;
	}

	return translatableCharCount / bodyCharCount;
}
