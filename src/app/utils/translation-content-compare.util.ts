import type { TranslationFile } from "@/app/services/translator/";

/**
 * Normalizes markdown text for stable equality checks across platforms.
 *
 * @param markdown Raw markdown from the repository or the LLM
 *
 * @returns Text with Windows-style newlines converted to `\n`
 *
 * @example
 * ```typescript
 * normalizeForTranslationCompare("a\r\nb");
 * // ^? "a\nb"
 * ```
 */
export function normalizeForTranslationCompare(markdown: string) {
	return markdown.replace(/\r\n/g, "\n");
}

/**
 * Detects when translated output is byte-equivalent to the current file blob.
 *
 * Used to skip commits and pull requests when the LLM produced no effective change.
 *
 * @param file Translation file carrying the pre-translation blob in `content`
 * @param translation Model output for the same path
 *
 * @returns `true` when normalized `translation` matches normalized `file.content`
 *
 * @example
 * ```typescript
 * const file = new TranslationFile("hello", "x.md", "src/x.md", "abc");
 * isTranslationEquivalentToCurrentBlob(file, "hello");
 * // ^? true
 * ```
 */
export function isTranslationEquivalentToCurrentBlob(file: TranslationFile, translation: string) {
	return (
		normalizeForTranslationCompare(file.content) === normalizeForTranslationCompare(translation)
	);
}
