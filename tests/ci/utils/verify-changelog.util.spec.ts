import { describe, expect, test } from "bun:test";

import {
	assertChangelogListsVersion,
	changelogHeadingForVersion,
	ChangelogVersionMismatchError,
} from "@/ci/utils/verify-changelog.util";

describe("verify-changelog.util", () => {
	test("changelogHeadingForVersion formats release section title", () => {
		expect(changelogHeadingForVersion("0.2.1")).toBe("## [0.2.1]");
	});

	test("assertChangelogListsVersion passes when heading exists", () => {
		expect(() => {
			assertChangelogListsVersion("## [0.2.1]\n\n- change\n", "0.2.1");
		}).not.toThrow();
	});

	test("assertChangelogListsVersion throws when heading is missing", () => {
		expect(() => {
			assertChangelogListsVersion("# Changelog\n", "0.2.1");
		}).toThrow(ChangelogVersionMismatchError);
	});
});
