import type { RepositoryTreeItem } from "@/app/services/github/types";

/** Strict pattern for translatable markdown paths under `src/` */
const SAFE_TRANSLATABLE_PATH_PATTERN = /^src\/(?:[^/]+\/)*[^/]+\.md$/;

/**
 * Returns whether a repository path is safe to fetch or commit as translatable markdown.
 *
 * Rejects path traversal (`..`), backslashes, absolute paths, and paths outside
 * `src/<segment>/.../*.md`.
 *
 * @param path Repository-relative file path
 *
 * @returns `true` when the path is safe for translation I/O
 */
export function isSafeTranslatablePath(path: string) {
	if (!path) return false;
	if (path.includes("\\")) return false;
	if (path.startsWith("/")) return false;
	if (path.includes("..")) return false;

	const segments = path.split("/");
	if (segments.some((segment) => segment === "" || segment === ".")) return false;

	return SAFE_TRANSLATABLE_PATH_PATTERN.test(path);
}

/**
 * Filters repository tree for markdown files.
 *
 * @param tree Repository tree from GitHub API
 *
 * @returns Tree items for translatable `.md` files under `src/`
 */
export function filterMarkdownFiles(tree: RepositoryTreeItem[]): RepositoryTreeItem[] {
	return tree.filter((item) => {
		if (!item.path) return false;

		return isSafeTranslatablePath(item.path);
	});
}
