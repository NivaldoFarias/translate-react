import { homepage } from "@package";

/** Matches a Markdown link reference definition used for changelog footer links */
const FOOTER_LINK_PATTERN = new RegExp(/^\[[^\]]+\]:/);

/** Matches a release heading carrying an ISO date, e.g. `## [0.2.3] - 2026-06-02` */
const DATED_HEADING_PATTERN = new RegExp(/^## \[(?<version>[^\]]+)\] - (?<date>\d{4}-\d{2}-\d{2})/);

/** Matches at least one Markdown bullet in a section body */
const BULLET_PATTERN = new RegExp(/^\s*-\s/m);

/**
 * Builds the bare release section heading for a package version.
 *
 * @param version Semver from `package.json`
 *
 * @returns Heading line such as `## [0.2.3]` (without a date)
 *
 * @example
 * ```typescript
 * changelogHeadingForVersion("0.2.3");
 * // ^? "## [0.2.3]"
 * ```
 */
export function changelogHeadingForVersion(version: string) {
	return `## [${version}]`;
}

/**
 * Formats a release date as an ISO 8601 calendar date.
 *
 * @param date Date to format (defaults to now)
 *
 * @returns Date string in `YYYY-MM-DD` form
 *
 * @example
 * ```typescript
 * formatReleaseDate(new Date("2026-06-02T13:00:00Z"));
 * // ^? "2026-06-02"
 * ```
 */
export function formatReleaseDate(date: Date = new Date()) {
	return date.toISOString().slice(0, 10);
}

/**
 * Builds the footer link reference for a released version.
 *
 * @param version Semver being released
 * @param repositoryUrl Repository base URL (defaults to `package.json` `homepage`)
 *
 * @returns Link reference such as `[0.2.3]: https://…/releases/tag/v0.2.3`
 *
 * @example
 * ```typescript
 * buildReleaseFooterLink("0.2.3");
 * // ^? "[0.2.3]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.3"
 * ```
 */
export function buildReleaseFooterLink(version: string, repositoryUrl: string = homepage) {
	return `[${version}]: ${repositoryUrl}/releases/tag/v${version}`;
}

/**
 * Extracts the curated entries of a `CHANGELOG.md` version section.
 *
 * Reads the lines between the version heading and the next section heading or
 * footer link block, trimming surrounding whitespace.
 *
 * @param changelogContent Full `CHANGELOG.md` text
 * @param version Semver whose section to extract
 *
 * @returns Section body (without the heading), or `null` when the heading is absent
 *
 * @example
 * ```typescript
 * extractChangelogEntries("## [0.2.3] - 2026-06-02\n\n### Fixed\n\n- A bug.\n", "0.2.3");
 * // ^? "### Fixed\n\n- A bug."
 * ```
 */
export function extractChangelogEntries(changelogContent: string, version: string) {
	const lines = changelogContent.split("\n");
	const headingPrefix = changelogHeadingForVersion(version);
	const startIndex = lines.findIndex((line) => line.startsWith(headingPrefix));

	if (startIndex === -1) return null;

	let endIndex = lines.length;

	for (let index = startIndex + 1; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const reachedNextSection = line.startsWith("## [") || FOOTER_LINK_PATTERN.test(line);

		if (reachedNextSection) {
			endIndex = index;
			break;
		}
	}

	return lines
		.slice(startIndex + 1, endIndex)
		.join("\n")
		.trim();
}

/**
 * Reports whether a changelog section body contains at least one bullet entry.
 *
 * @param sectionBody Trimmed section text from {@link extractChangelogEntries}
 *
 * @returns `true` when the body has one or more Markdown bullets
 */
export function changelogSectionHasEntries(sectionBody: string) {
	return BULLET_PATTERN.test(sectionBody);
}

/**
 * Reports whether a release heading for the version includes an ISO date.
 *
 * @param changelogContent Full `CHANGELOG.md` text
 * @param version Semver to look for
 *
 * @returns `true` when a `## [version] - YYYY-MM-DD` heading exists
 */
export function changelogHasDatedHeading(changelogContent: string, version: string) {
	return changelogContent.split("\n").some((line) => {
		const match = DATED_HEADING_PATTERN.exec(line);
		return match?.groups?.["version"] === version;
	});
}

/**
 * Reports whether the changelog footer links the released version.
 *
 * @param changelogContent Full `CHANGELOG.md` text
 * @param version Semver to look for
 *
 * @returns `true` when a `[version]:` footer link exists
 */
export function changelogHasFooterLink(changelogContent: string, version: string) {
	return changelogContent.split("\n").some((line) => line.startsWith(`[${version}]:`));
}

/** Thrown when promoting `## [Unreleased]` but no such heading exists */
export class MissingUnreleasedSectionError extends Error {
	public constructor() {
		super("CHANGELOG.md has no `## [Unreleased]` section to promote.");
		this.name = "MissingUnreleasedSectionError";
	}
}

/** Options for {@link promoteUnreleasedToVersion} */
export interface PromoteUnreleasedOptions {
	/** Semver being released */
	version: string;

	/** Release date (defaults to now) */
	date?: Date;

	/** Repository base URL for the footer link (defaults to `package.json` `homepage`) */
	repositoryUrl?: string;
}

/**
 * Promotes `## [Unreleased]` to a dated release section and appends its footer link.
 *
 * Renames the existing `## [Unreleased]` heading to `## [X.Y.Z] - YYYY-MM-DD`
 * (keeping the existing entries beneath it), inserts a fresh empty
 * `## [Unreleased]` above it, and adds the release footer link at the top of the
 * footer block (newest first).
 *
 * @param changelogContent Full `CHANGELOG.md` text
 * @param options Release {@link PromoteUnreleasedOptions}
 * @param options.version Semver being released
 * @param options.date Release date (defaults to now)
 * @param options.repositoryUrl Repository base URL for the footer link (defaults to `package.json` `homepage`)
 *
 * @returns Updated `CHANGELOG.md` text
 *
 * @throws {MissingUnreleasedSectionError} When there is no `## [Unreleased]` heading
 *
 * @example
 * ```typescript
 * const next = promoteUnreleasedToVersion(changelog, { version: "0.2.3" });
 * ```
 */
export function promoteUnreleasedToVersion(
	changelogContent: string,
	{ version, date = new Date(), repositoryUrl = homepage }: PromoteUnreleasedOptions,
) {
	const unreleasedHeadingPattern = new RegExp(/^## \[Unreleased\][^\n]*$/m);

	if (!unreleasedHeadingPattern.test(changelogContent)) {
		throw new MissingUnreleasedSectionError();
	}

	const promotedHeading = `## [Unreleased]\n\n## [${version}] - ${formatReleaseDate(date)}`;
	const withPromotedHeading = changelogContent.replace(unreleasedHeadingPattern, promotedHeading);

	const footerLink = buildReleaseFooterLink(version, repositoryUrl);
	const lines = withPromotedHeading.split("\n");
	const footerIndex = lines.findIndex((line) => FOOTER_LINK_PATTERN.test(line));

	if (footerIndex === -1) {
		return `${withPromotedHeading.trimEnd()}\n\n${footerLink}\n`;
	}

	lines.splice(footerIndex, 0, footerLink);

	return lines.join("\n");
}
