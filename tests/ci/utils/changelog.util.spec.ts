import { describe, expect, test } from "bun:test";

import {
	buildReleaseFooterLink,
	changelogHeadingForVersion,
	extractChangelogEntries,
	formatReleaseDate,
	MissingUnreleasedSectionError,
	promoteUnreleasedToVersion,
} from "@/ci/utils/changelog.util";

const REPOSITORY_URL = "https://github.com/NivaldoFarias/translate-react";

const CHANGELOG = [
	"# Changelog",
	"",
	"## [Unreleased]",
	"",
	"### Added",
	"",
	"- A new flag.",
	"",
	"## [0.2.2] - 2026-06-01",
	"",
	"### Fixed",
	"",
	"- An old bug.",
	"",
	`[0.2.2]: ${REPOSITORY_URL}/releases/tag/v0.2.2`,
	"",
].join("\n");

describe("changelog.util", () => {
	describe("changelogHeadingForVersion", () => {
		test("formats the bare release heading", () => {
			expect(changelogHeadingForVersion("0.2.3")).toBe("## [0.2.3]");
		});
	});

	describe("formatReleaseDate", () => {
		test("formats a date as YYYY-MM-DD", () => {
			expect(formatReleaseDate(new Date("2026-06-02T13:00:00Z"))).toBe("2026-06-02");
		});
	});

	describe("buildReleaseFooterLink", () => {
		test("builds the tag link for a version", () => {
			expect(buildReleaseFooterLink("0.2.3", REPOSITORY_URL)).toBe(
				`[0.2.3]: ${REPOSITORY_URL}/releases/tag/v0.2.3`,
			);
		});
	});

	describe("extractChangelogEntries", () => {
		test("returns the trimmed body of a version section", () => {
			expect(extractChangelogEntries(CHANGELOG, "0.2.2")).toBe("### Fixed\n\n- An old bug.");
		});

		test("returns the Unreleased body before promotion", () => {
			expect(extractChangelogEntries(CHANGELOG, "Unreleased")).toBe("### Added\n\n- A new flag.");
		});

		test("returns null when the version is absent", () => {
			expect(extractChangelogEntries(CHANGELOG, "9.9.9")).toBeNull();
		});

		test("does not match a version that is a prefix of another", () => {
			const changelog = ["## [0.2.10] - 2026-06-02", "", "- Ten.", ""].join("\n");

			expect(extractChangelogEntries(changelog, "0.2.1")).toBeNull();
		});
	});

	describe("promoteUnreleasedToVersion", () => {
		test("promotes Unreleased into a dated section and inserts a fresh Unreleased", () => {
			const result = promoteUnreleasedToVersion(CHANGELOG, {
				version: "0.2.3",
				date: new Date("2026-06-02T13:00:00Z"),
				repositoryUrl: REPOSITORY_URL,
			});

			expect(result).toContain("## [Unreleased]\n\n## [0.2.3] - 2026-06-02");
			expect(extractChangelogEntries(result, "0.2.3")).toBe("### Added\n\n- A new flag.");
			expect(extractChangelogEntries(result, "Unreleased")).toBe("");
		});

		test("inserts the new footer link above existing links (newest first)", () => {
			const result = promoteUnreleasedToVersion(CHANGELOG, {
				version: "0.2.3",
				date: new Date("2026-06-02T13:00:00Z"),
				repositoryUrl: REPOSITORY_URL,
			});

			const newLinkIndex = result.indexOf("[0.2.3]:");
			const oldLinkIndex = result.indexOf("[0.2.2]:");

			expect(newLinkIndex).toBeGreaterThan(-1);
			expect(newLinkIndex).toBeLessThan(oldLinkIndex);
		});

		test("throws when there is no Unreleased section", () => {
			expect(() => {
				promoteUnreleasedToVersion("# Changelog\n\n## [0.2.2] - 2026-06-01\n", {
					version: "0.2.3",
				});
			}).toThrow(MissingUnreleasedSectionError);
		});
	});
});
