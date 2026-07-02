/**
 * Bumps `package.json` and promotes `## [Unreleased]` into a dated release section.
 *
 * Runs `bun pm version <increment> --no-git-tag-version`, then rewrites
 * `CHANGELOG.md` so the `## [Unreleased]` entries become `## [X.Y.Z] - YYYY-MM-DD`
 * with a fresh empty `## [Unreleased]` above and a new footer link. Does not
 * stage, commit, or create a git tag.
 *
 * @example
 * ```bash
 * bun run release:prepare patch
 * ```
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { defineCommand, runCommand } from "citty";

import { promoteUnreleasedToVersion } from "@/ci/utils/changelog.util";
import { bumpPackageVersion, readPackageVersion } from "@/ci/utils/release.util";
import { createLogger } from "@/shared/utils/create-logger.util";

const log = createLogger({ level: "info", logToConsole: true }).child({
	component: "prepare-release",
});

const prepareReleaseCommand = defineCommand({
	meta: {
		name: "prepare-release",
		description: "Bump package.json and promote the changelog Unreleased section",
	},
	args: {
		increment: {
			type: "positional",
			description: "patch, minor, major, or any `bun pm version` increment",
			required: true,
		},
	},
	run({ args }) {
		const repositoryRoot = process.cwd();
		const previousVersion = readPackageVersion(repositoryRoot);

		bumpPackageVersion(args.increment, repositoryRoot);

		const version = readPackageVersion(repositoryRoot);

		log.info({ previousVersion, version }, "Bumped package.json version");

		const changelogPath = join(repositoryRoot, "CHANGELOG.md");
		const changelog = readFileSync(changelogPath, "utf8");
		const promoted = promoteUnreleasedToVersion(changelog, { version });

		writeFileSync(changelogPath, promoted);

		log.info({ version }, "Promoted CHANGELOG.md Unreleased section");
	},
});

await runCommand(prepareReleaseCommand, { rawArgs: process.argv.slice(2) });
