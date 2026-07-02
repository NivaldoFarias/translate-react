/** Reserved per-translation attempt metadata for prompt builders */
export type TranslationAttemptContext = Readonly<Record<string, never>>;

/**
 * Returns an empty attempt context.
 *
 * @returns Empty context for a new translation attempt
 */
export const emptyTranslationAttemptContext = (): TranslationAttemptContext => ({});
