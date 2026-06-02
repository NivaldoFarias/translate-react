import { readFileSync } from "node:fs";
import { join } from "node:path";

import { version as packageVersion } from "@package";

import {
	changelogHasDatedHeading,
	changelogHasFooterLink,
	changelogHeadingForVersion,
	changelogSectionHasEntries,
	extractChangelogEntries,
} from "@/ci/utils/changelog.util";

/** Distinct compliance problem a changelog section can have for a version */
export type ChangelogIssue =
	| "missing-heading"
	| "missing-date"
	| "missing-footer-link"
	| "empty-section";

/** Human-readable remediation hint for each {@link ChangelogIssue} */
const ISSUE_MESSAGES = {
	"missing-heading": "add a release section after bumping the package.json version",
	"missing-date":
		"use a dated heading `## [{version}] - YYYY-MM-DD` (run `bun run release:prepare`)",
	"missing-footer-link": "append the `[{version}]:` release footer link",
	"empty-section": "add at least one bullet describing the release",
} satisfies Record<ChangelogIssue, string>;

/** Thrown when `CHANGELOG.md` is not release-ready for the current `package.json` version */
export class ChangelogVersionMismatchError extends Error {
	public constructor(
		public readonly version: string,
		public readonly issue: ChangelogIssue,
	) {
		const hint = ISSUE_MESSAGES[issue].replace("{version}", version);
		super(`CHANGELOG.md is not release-ready for ${version}: ${hint}.`);
		this.name = "ChangelogVersionMismatchError";
	}
}

/**
 * Ensures `CHANGELOG.md` has a complete, release-ready section for a version.
 *
 * Verifies, in order, that the changelog has a heading for the version, a dated
 * heading (`## [X.Y.Z] - YYYY-MM-DD`), a non-empty section, and a footer link.
 * This catches bump-only commits that forget to promote `## [Unreleased]`.
 *
 * @param changelogContent Full `CHANGELOG.md` text
 * @param version Semver from `package.json`
 *
 * @throws {ChangelogVersionMismatchError} When any required part is missing
 *
 * @example
 * ```typescript
 * assertChangelogListsVersion(changelog, "0.2.3");
 * ```
 */
export function assertChangelogListsVersion(changelogContent: string, version: string) {
	const entries = extractChangelogEntries(changelogContent, version);

	if (entries === null || !changelogContent.includes(changelogHeadingForVersion(version))) {
		throw new ChangelogVersionMismatchError(version, "missing-heading");
	}

	if (!changelogHasDatedHeading(changelogContent, version)) {
		throw new ChangelogVersionMismatchError(version, "missing-date");
	}

	if (!changelogSectionHasEntries(entries)) {
		throw new ChangelogVersionMismatchError(version, "empty-section");
	}

	if (!changelogHasFooterLink(changelogContent, version)) {
		throw new ChangelogVersionMismatchError(version, "missing-footer-link");
	}
}

/**
 * Verifies the repository `CHANGELOG.md` is release-ready for the current package version.
 *
 * @param repositoryRoot Directory containing `CHANGELOG.md` (defaults to cwd)
 *
 * @throws {ChangelogVersionMismatchError} When the section is missing or incomplete
 */
export function verifyChangelogListsPackageVersion(repositoryRoot = process.cwd()) {
	const changelogPath = join(repositoryRoot, "CHANGELOG.md");
	const changelog = readFileSync(changelogPath, "utf8");

	assertChangelogListsVersion(changelog, packageVersion);
}
