import { describe, expect, test } from "bun:test";

import {
	assertChangelogListsVersion,
	ChangelogVersionMismatchError,
} from "@/ci/utils/verify-changelog.util";

const RELEASE_READY = [
	"## [Unreleased]",
	"",
	"## [0.2.3] - 2026-06-02",
	"",
	"### Fixed",
	"",
	"- A bug.",
	"",
	"[0.2.3]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.3",
	"",
].join("\n");

/** Runs the assertion and returns the thrown {@link ChangelogVersionMismatchError}, if any */
function captureIssue(changelog: string, version: string) {
	try {
		assertChangelogListsVersion(changelog, version);
		return null;
	} catch (error) {
		return error instanceof ChangelogVersionMismatchError ? error.issue : "other";
	}
}

describe("verify-changelog.util", () => {
	describe("assertChangelogListsVersion", () => {
		test("passes for a dated, non-empty, footer-linked section", () => {
			expect(() => {
				assertChangelogListsVersion(RELEASE_READY, "0.2.3");
			}).not.toThrow();
		});

		test("reports missing-heading when the version is absent", () => {
			expect(captureIssue("# Changelog\n", "0.2.3")).toBe("missing-heading");
		});

		test("reports missing-date when the heading has no ISO date", () => {
			const changelog = RELEASE_READY.replace("## [0.2.3] - 2026-06-02", "## [0.2.3]");

			expect(captureIssue(changelog, "0.2.3")).toBe("missing-date");
		});

		test("reports empty-section when the section has no bullets", () => {
			const changelog = [
				"## [0.2.3] - 2026-06-02",
				"",
				"[0.2.3]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.3",
				"",
			].join("\n");

			expect(captureIssue(changelog, "0.2.3")).toBe("empty-section");
		});

		test("reports missing-footer-link when the footer reference is absent", () => {
			const changelog = ["## [0.2.3] - 2026-06-02", "", "### Fixed", "", "- A bug.", ""].join("\n");

			expect(captureIssue(changelog, "0.2.3")).toBe("missing-footer-link");
		});

		test("throws ChangelogVersionMismatchError for incomplete sections", () => {
			expect(() => {
				assertChangelogListsVersion("# Changelog\n", "0.2.3");
			}).toThrow(ChangelogVersionMismatchError);
		});
	});
});
