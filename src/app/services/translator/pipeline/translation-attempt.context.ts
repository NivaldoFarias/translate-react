/** Context passed into each translation attempt when post-translation guards request a retry */
export type TranslationAttemptContext = Readonly<{
	validationRetryHints: readonly string[];

	/** Maintainer PR review bodies to apply on the first attempt (preserved across guard retries) */
	readonly maintainerReviewComments?: readonly string[];
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
 * @param base Prior attempt context whose maintainer review comments are preserved
 *
 * @returns Attempt context carrying the supplied hints for the next LLM call
 */
export const translationAttemptContextFromHints = (
	hints: readonly string[],
	base: TranslationAttemptContext = emptyTranslationAttemptContext(),
): TranslationAttemptContext => {
	const mergedHints = [...base.validationRetryHints, ...hints].filter(
		(hint) => hint.trim().length > 0,
	);

	return {
		...base,
		validationRetryHints: [...new Set(mergedHints)],
	};
};

/**
 * Builds an attempt context that carries maintainer PR review feedback into the LLM prompt.
 *
 * @param commentBodies Maintainer issue comment bodies after the latest runner commit
 *
 * @returns Attempt context for a maintainer-driven re-translation
 */
export const translationAttemptContextFromMaintainerReview = (
	commentBodies: readonly string[],
): TranslationAttemptContext => ({
	validationRetryHints: [],
	maintainerReviewComments: commentBodies,
});
