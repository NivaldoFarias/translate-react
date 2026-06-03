/**
 * Writes the curated `CHANGELOG.md` section for a tag to `release-notes.md`.
 *
 * Used by [`.github/workflows/release.yml`](../../.github/workflows/release.yml) to
 * feed the GitHub Release body. Writing a file (instead of `GITHUB_OUTPUT`) avoids
 * the single-line output limit enforced by `writeGitHubActionsOutput`.
 *
 * @example
 * ```bash
 * bun run ci:changelog-notes v0.2.3
 * ```
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { defineCommand, runCommand } from "citty";

import { extractChangelogEntries } from "@/ci/utils/changelog.util";
import { createLogger } from "@/shared/utils/create-logger.util";

const log = createLogger({ level: "info", logToConsole: true }).child({
	component: "changelog-notes",
});

/**
 * Strips a leading `v` so `v0.2.3` and `0.2.3` both resolve to a semver
 *
 * @param tag Release tag from GitHub (with or without leading `v`)
 *
 * @returns Semver string without the `v` prefix
 */
function normalizeVersion(tag: string) {
	return tag.startsWith("v") ? tag.slice(1) : tag;
}

const changelogNotesCommand = defineCommand({
	meta: {
		name: "changelog-notes",
		description: "Extract a CHANGELOG.md release section into release-notes.md",
	},
	args: {
		tag: {
			type: "positional",
			description: "Release tag or version (e.g. v0.2.3 or 0.2.3)",
			required: true,
		},
		out: {
			type: "string",
			description: "Output file path",
			default: "release-notes.md",
		},
	},
	run({ args }) {
		const repositoryRoot = process.cwd();
		const version = normalizeVersion(args.tag);
		const changelog = readFileSync(join(repositoryRoot, "CHANGELOG.md"), "utf8");
		const entries = extractChangelogEntries(changelog, version);

		if (entries === null || entries.length === 0) {
			log.error({ version }, "No CHANGELOG.md section found for version");
			process.exit(1);
		}

		const outputPath = join(repositoryRoot, args.out);

		writeFileSync(outputPath, `${entries}\n`);

		log.info({ version, outputPath }, "Wrote release notes");
	},
});

await runCommand(changelogNotesCommand, { rawArgs: process.argv.slice(2) });
