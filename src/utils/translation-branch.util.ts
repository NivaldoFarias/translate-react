/**
 * Resolves the fork branch name used for a documentation path translation PR.
 *
 * @param filePath Repository path such as `src/content/reference/react/legacy.md`
 *
 * @returns Branch name such as `translate/reference/react/legacy.md`
 *
 * @example
 * ```typescript
 * getTranslationBranchNameFromPath("src/content/blog/post.md");
 * // ^? "translate/blog/post.md"
 * ```
 */
export function getTranslationBranchNameFromPath(filePath: string) {
	return `translate/${filePath.split("/").slice(2).join("/")}`;
}
