/** Context passed into each translation attempt when post-translation guards request a retry */
export type TranslationAttemptContext = Readonly<{
	validationRetryHints: readonly string[];
}>;

/** Returns an empty attempt context for the first translation try */
export const emptyTranslationAttemptContext = (): TranslationAttemptContext => ({
	validationRetryHints: [],
});

/**
 * Builds an attempt context from guard retry hints.
 *
 * @param hints Retry hints collected from failed post-translation guards
 */
export const translationAttemptContextFromHints = (
	hints: readonly string[],
): TranslationAttemptContext => ({
	validationRetryHints: hints,
});
