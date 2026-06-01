import { readFileSync } from "node:fs";
import { join } from "node:path";

import { version as packageVersion } from "@package";

/** Thrown when `CHANGELOG.md` has no section for the current `package.json` version */
export class ChangelogVersionMismatchError extends Error {
	public constructor(public readonly expectedHeading: string) {
		super(
			`Add ${JSON.stringify(expectedHeading)} to CHANGELOG.md when you bump package.json version.`,
		);
		this.name = "ChangelogVersionMismatchError";
	}
}

/**
 * Builds the required `CHANGELOG.md` section heading for a package version.
 *
 * @param version Semver from `package.json`
 *
 * @returns Heading line such as `## [0.2.1]`
 */
export function changelogHeadingForVersion(version: string) {
	return `## [${version}]`;
}

/**
 * Ensures `CHANGELOG.md` contains a release section for the given package version.
 *
 * @param changelogContent Full `CHANGELOG.md` text
 * @param version Semver from `package.json`
 *
 * @throws {ChangelogVersionMismatchError} When the heading is missing
 */
export function assertChangelogListsVersion(changelogContent: string, version: string) {
	const expectedHeading = changelogHeadingForVersion(version);

	if (!changelogContent.includes(expectedHeading)) {
		throw new ChangelogVersionMismatchError(expectedHeading);
	}
}

/**
 * Verifies the repository `CHANGELOG.md` lists the current `package.json` version.
 *
 * @param repositoryRoot Directory containing `CHANGELOG.md` (defaults to cwd)
 *
 * @throws {ChangelogVersionMismatchError} When the heading is missing
 */
export function verifyChangelogListsPackageVersion(repositoryRoot = process.cwd()) {
	const changelogPath = join(repositoryRoot, "CHANGELOG.md");
	const changelog = readFileSync(changelogPath, "utf8");

	assertChangelogListsVersion(changelog, packageVersion);
}
