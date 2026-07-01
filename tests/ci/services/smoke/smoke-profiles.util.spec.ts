import { describe, expect, test } from "bun:test";

import {
	resolveSmokeFixtureBasenames,
	SmokeProfile,
} from "@/ci/services/smoke/smoke-profiles.util";

describe("smoke-profiles.util", () => {
	describe("resolveSmokeFixtureBasenames", () => {
		test("returns quick profile fixtures by default", () => {
			expect(resolveSmokeFixtureBasenames(SmokeProfile.Quick, "")).toEqual([
				"use-memo.md",
				"react-labs-view-transitions-activity-and-more.md",
				"lazy.md",
				"invalid-hook-call-warning.md",
			]);
		});

		test("returns undefined for full profile", () => {
			expect(resolveSmokeFixtureBasenames(SmokeProfile.Full, "")).toBeUndefined();
		});

		test("prefers explicit files over profile", () => {
			expect(resolveSmokeFixtureBasenames(SmokeProfile.Quick, "hydrateRoot.md, lazy.md")).toEqual([
				"hydrateRoot.md",
				"lazy.md",
			]);
		});
	});
});
