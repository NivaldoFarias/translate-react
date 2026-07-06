import type { TranslationPullRequestValidity } from "@/app/services/runner/workflow/translation-pull-request-validity.manager";

import { env } from "@/app/schemas/env.schema";

import { isSafeTranslatablePath } from "./markdown-path.util";
import { parseTranslationFilePaths } from "./parse-translation-file-paths.util";

export { parseTranslationFilePaths } from "./parse-translation-file-paths.util";

/**
 * Returns configured single-file or multi-file translation targets from the environment.
 *
 * @returns Parsed {@link env.TRANSLATION_FILE_PATHS} entries
 */
export function getConfiguredTranslationTargetPaths() {
	return parseTranslationFilePaths(env.TRANSLATION_FILE_PATHS);
}

/**
 * Returns whether `filePath` is a configured force-retranslation target.
 *
 * @param filePath Repository path under `src/`
 * @param targetPaths Configured target paths
 *
 * @returns `true` when the path is listed for targeted re-translation
 */
export function isForceRetranslatePath(filePath: string, targetPaths: readonly string[]) {
	return targetPaths.length > 0 && targetPaths.includes(filePath);
}

/**
 * Returns whether `filePath` should bypass valid-pull-request skip logic.
 *
 * @param filePath Repository path under `src/`
 *
 * @returns `true` when targeted re-translation is configured for the path
 */
export function isConfiguredForceRetranslatePath(filePath: string) {
	return isForceRetranslatePath(filePath, getConfiguredTranslationTargetPaths());
}

/**
 * Returns whether an open translation pull request should be refreshed in place.
 *
 * @param filePath Repository path under `src/`
 * @param validity Pull request validity evaluated at file-processing start
 * @param targetPaths Configured target paths; defaults to {@link getConfiguredTranslationTargetPaths}
 *
 * @returns `true` when the branch should be reset without closing the open PR
 */
export function shouldPreserveOpenPullRequestOnRefresh(
	filePath: string,
	validity: Pick<TranslationPullRequestValidity, "pullRequest" | "invalidReason">,
	targetPaths: readonly string[] = getConfiguredTranslationTargetPaths(),
) {
	if (!validity.pullRequest) {
		return false;
	}

	if (validity.invalidReason === "out_of_sync") {
		return true;
	}

	return isForceRetranslatePath(filePath, targetPaths);
}

/**
 * Restricts repository tree items to configured translation targets.
 *
 * @param files Candidate repository paths
 * @param targetPaths Configured target paths; empty means no restriction
 *
 * @returns Filtered files when targets are configured, otherwise the original list
 */
export function filterToTranslationTargets<T extends { path: string }>(
	files: T[],
	targetPaths: readonly string[],
) {
	if (targetPaths.length === 0) {
		return files;
	}

	return files.filter((file) => targetPaths.includes(file.path));
}

/**
 * Validates configured translation target paths for safe markdown I/O.
 *
 * @param targetPaths Configured target paths
 *
 * @returns Paths that fail {@link isSafeTranslatablePath}
 */
export function findUnsafeTranslationTargetPaths(targetPaths: readonly string[]) {
	return targetPaths.filter((path) => !isSafeTranslatablePath(path));
}
