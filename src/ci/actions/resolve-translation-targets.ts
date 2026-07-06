/**
 * Resolves targeted translation paths for manual workflow dispatch.
 *
 * Writes `path` and `has_target_paths` to `GITHUB_OUTPUT` without loading app env validation.
 *
 * @example
 * ```bash
 * bun run ci:resolve-translation-targets -- --file-path "src/content/blog/post.md"
 * ```
 */

import { defineCommand, runCommand } from "citty";

import { writeCiWorkflowOutput } from "@/ci/utils/github-output.util";
import { resolveTranslationTargets } from "@/ci/utils/resolve-translation-targets.util";
import { createLogger } from "@/shared/utils/create-logger.util";

const logger = createLogger({ level: "info", logToConsole: true }).child({
	component: "resolve-translation-targets",
});

const resolveTranslationTargetsCommand = defineCommand({
	meta: {
		name: "resolve-translation-targets",
		description: "Resolve targeted translation paths for workflow dispatch",
	},
	args: {
		"file-path": {
			type: "string",
			description: "Manual workflow file_path input",
			default: "",
		},
	},
	run({ args }) {
		const resolved = resolveTranslationTargets({
			filePathInput: args["file-path"],
			translationFilePathsEnv: import.meta.env["TRANSLATION_FILE_PATHS"],
		});

		logger.debug(resolved, "Resolved translation targets");

		writeCiWorkflowOutput("path", resolved.path);
		writeCiWorkflowOutput("has_target_paths", resolved.hasTargetPaths ? "true" : "false");
	},
});

await runCommand(resolveTranslationTargetsCommand, { rawArgs: process.argv.slice(2) });
