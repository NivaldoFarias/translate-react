/** Named fixture sets for workflow smoke runs */
export const SmokeProfile = {
	Quick: "quick",
	Workflow: "workflow",
	Full: "full",
} as const;

/** CLI / workflow input profile id */
export type SmokeProfileId = (typeof SmokeProfile)[keyof typeof SmokeProfile];

const smokeProfileValues = new Set<string>(Object.values(SmokeProfile));

/**
 * @param value Raw `--profile` argument
 *
 * @returns `true` when `value` is a {@link SmokeProfileId}
 */
export function isSmokeProfileId(value: string): value is SmokeProfileId {
	return smokeProfileValues.has(value);
}

/** Fixture basenames per non-`full` profile (must exist under `tests/fixtures/md/`) */
export const SMOKE_PROFILE_FIXTURES = {
	[SmokeProfile.Quick]: [
		"use-memo.md",
		"react-labs-view-transitions-activity-and-more.md",
		"lazy.md",
	],
	[SmokeProfile.Workflow]: ["lazy.md", "react-19.md", "react-conf-2021-recap.md"],
} as const satisfies Record<Exclude<SmokeProfileId, "full">, readonly string[]>;

/**
 * Resolves markdown fixture basenames for a smoke run.
 *
 * Explicit `--files` wins over `profile`. `full` loads every `*.md` under the fixture directory.
 *
 * @param profile Smoke profile when `filesArgument` is empty
 * @param filesArgument Comma-separated fixture basenames from `--files`
 *
 * @returns Basenames to load, or `undefined` to load every on-disk fixture
 */
export function resolveSmokeFixtureBasenames(profile: SmokeProfileId, filesArgument: string) {
	const explicit = filesArgument
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);

	if (explicit.length > 0) {
		return explicit;
	}

	if (profile === SmokeProfile.Full) {
		return undefined;
	}

	return [...SMOKE_PROFILE_FIXTURES[profile]];
}
