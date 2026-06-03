import type { PostTranslationValidationGuard } from "../validation.types";

/**
 * Minimum acceptable ratio of translated length to source length.
 *
 * Set to 0.7 (70%) to catch truncation from LLM token limits while allowing
 * moderate contraction in terse locales.
 */
const MIN_CONTENT_RATIO = 0.7;

/**
 * Maximum acceptable ratio of translated length to source length.
 *
 * Set to 1.4 (140%) to catch hallucinated or duplicated content while allowing
 * moderate expansion in verbose locales (e.g., German).
 */
const MAX_CONTENT_RATIO = 1.4;

/**
 * Rejects translations with suspiciously low or high content length ratios.
 *
 * A very low ratio (< 0.65) typically indicates truncated output from the LLM
 * hitting completion token limits. A very high ratio (> 2.5) suggests the model
 * hallucinated excessive content or duplicated sections.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when the ratio is acceptable
 */
export const contentRatioGuard: PostTranslationValidationGuard = (source, translated) => {
	const sourceLength = source.trim().length;
	const translatedLength = translated.trim().length;

	if (sourceLength === 0) return null;

	const ratio = translatedLength / sourceLength;

	if (ratio < MIN_CONTENT_RATIO) {
		return {
			guardId: "contentRatio",
			message: `Translation content ratio too low (${(ratio * 100).toFixed(0)}%)`,
			retryHint:
				"The translated output appears truncated. Return the complete translation of ALL sections without omitting any content. Do not summarize or shorten the document.",
		};
	}

	if (ratio > MAX_CONTENT_RATIO) {
		return {
			guardId: "contentRatio",
			message: `Translation content ratio too high (${(ratio * 100).toFixed(0)}%)`,
			retryHint:
				"The translated output appears to contain duplicated or hallucinated content. Return only the translation of the source content without adding extra sections or repeating paragraphs.",
		};
	}

	return null;
};
