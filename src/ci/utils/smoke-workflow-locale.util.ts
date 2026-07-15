import { readFileSync } from "node:fs";
import path from "node:path";

/** Default path to the manual smoke workflow (repo root relative). */
export const DEFAULT_SMOKE_WORKFLOW_PATH = ".github/workflows/smoke.yml";

/**
 * Reads the `lang` `workflow_dispatch` choice options from `smoke.yml`.
 *
 * GitHub `choice` inputs are static YAML; this helper supports parity checks against
 * `.github/locales.json`.
 *
 * @param workflowPath Path to the workflow file (defaults to {@link DEFAULT_SMOKE_WORKFLOW_PATH})
 *
 * @returns Locale ids listed under the `lang` input `options`
 *
 * @throws {Error} When the `lang` block or its `options` list cannot be parsed
 */
export function readSmokeWorkflowDispatchLangs(workflowPath = DEFAULT_SMOKE_WORKFLOW_PATH) {
	const absolutePath =
		path.isAbsolute(workflowPath) ? workflowPath : path.join(process.cwd(), workflowPath);
	const content = readFileSync(absolutePath, "utf8");
	const langBlockPattern = /^\s+lang:\n(?<body>(?:^[ \t].+\n)+?)(?=^\s+files:)/m;
	const langBlock = langBlockPattern.exec(content);

	if (!langBlock?.groups?.["body"]) {
		throw new Error(`Could not find lang choice block in ${workflowPath}`);
	}

	const optionPattern = /^\s+-\s+(\S+)/gm;
	const options = [...langBlock.groups["body"].matchAll(optionPattern)].map((match) => match[1]);

	if (options.length === 0) {
		throw new Error(`No lang choice options in ${workflowPath}`);
	}

	return options;
}
