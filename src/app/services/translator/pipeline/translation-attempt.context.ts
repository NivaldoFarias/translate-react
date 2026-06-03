/** Context passed into each translation attempt when post-translation guards request a retry */
export type TranslationAttemptContext = Readonly<{
	validationRetryHints: readonly string[];
}>;

/**
 * Returns an empty attempt context for the first translation try.
 *
 * @returns Context with no validation retry hints
 */
export const emptyTranslationAttemptContext = (): TranslationAttemptContext => ({
	validationRetryHints: [],
});

/**
 * Builds an attempt context from guard retry hints.
 *
 * @param hints Retry hints collected from failed post-translation guards
 *
 * @returns Attempt context carrying the supplied hints for the next LLM call
 */
export const translationAttemptContextFromHints = (
	hints: readonly string[],
): TranslationAttemptContext => ({
	validationRetryHints: hints,
});
