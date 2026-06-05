/** Optional maintainer feedback injected into the translation system prompt */
export type TranslationAttemptContext = Readonly<{
	/** Maintainer PR review bodies for a maintainer-driven re-translation */
	readonly maintainerReviewComments?: readonly string[];
}>;

/**
 * Returns an empty attempt context (no maintainer feedback).
 *
 * @returns Empty context without `maintainerReviewComments`
 */
export const emptyTranslationAttemptContext = (): TranslationAttemptContext => ({});

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
	maintainerReviewComments: commentBodies,
});
