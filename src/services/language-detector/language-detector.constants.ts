/**
 * Minimum content length required for reliable language detection.
 *
 * Content shorter than this threshold is too small for accurate language
 * detection by CLD2, resulting in unreliable or undefined results.
 */
export const MIN_CONTENT_LENGTH_FOR_DETECTION = 10;

/**
 * Ratio threshold above which content is considered already translated.
 *
 * When the target language confidence ratio exceeds this value (0.5 = 50%),
 * the content is marked as translated and skipped from the translation workflow.
 */
export const TRANSLATION_RATIO_THRESHOLD = 0.5;
