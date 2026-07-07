import { collectTranslationFilePaths } from "@/app/utils/parse-translation-file-paths.util";

/** Resolved translation target inputs for workflow dispatch */
export interface ResolvedTranslationTargets {
	/** Trimmed manual `file_path` input for optional `--file` forwarding */
	path: string;

	/** Whether any configured target path limits the run */
	hasTargetPaths: boolean;
}

/**
 * Resolves workflow translation targets from manual input and environment.
 *
 * @param options Manual `file_path` input and optional `TRANSLATION_FILE_PATHS` env value
 * @param options.filePathInput Trimmed workflow `file_path` dispatch input
 * @param options.translationFilePathsEnv Raw `TRANSLATION_FILE_PATHS` environment value
 *
 * @returns Trimmed manual path and whether targeted re-translation is configured
 */
export function resolveTranslationTargets(options: {
	filePathInput?: string;
	translationFilePathsEnv?: string;
}) {
	const path = (options.filePathInput ?? "").trim();
	const targetPaths = collectTranslationFilePaths(path, options.translationFilePathsEnv);

	return {
		path,
		hasTargetPaths: targetPaths.length > 0,
	} satisfies ResolvedTranslationTargets;
}
