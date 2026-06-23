/**
 * Named fixture sets for `bun run ci:smoke` and [`.github/workflows/smoke.yml`](../../../../.github/workflows/smoke.yml).
 *
 * - Each profile selects markdown basenames under`tests/fixtures/md/`.
 * - Mock pull-request metadata for each basename lives in
 * [`workflow.manifest.ts`](../../../../tests/fixtures/md/workflow.manifest.ts).
 * - Profiles, `.out/` layout, and CI artifacts: [CONTRIBUTING.md](../../../../CONTRIBUTING.md).
 */
export const SmokeProfile = {
	/**
	 * Default pre-merge profile: small API reference and large MDX blog (new PR translation)
	 * plus one out-of-sync open-PR refresh. Three fixtures, enough to cover translation and branch refresh.
	 */
	Quick: "quick",

	/**
	 * PR workflow scenarios only: out-of-sync refresh, maintainer remediation, and valid skip.
	 * Use when testing PR validity and refresh logic without extra fixture pages.
	 */
	Workflow: "workflow",

	/**
	 * Every `*.md` under `tests/fixtures/md/`, including pages skipped by `quick` and `workflow`.
	 * Slowest profile. Run before release or after adding manifest entries.
	 */
	Full: "full",
} as const;

/** CLI/GitHub Actions input profile id */
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

/**
 * Fixture basenames per non-`full` profile (must exist under `tests/fixtures/md/`).
 *
 * - `"quick"`: `use-memo.md` and `react-labs-view-transitions-activity-and-more.md` (new PR,
 *   translation output), `lazy.md` (open PR behind upstream, branch refresh).
 * - `"workflow"`: `lazy.md` (out-of-sync refresh), `react-19.md` (unresolved
 *   `CHANGES_REQUESTED` remediation), `react-conf-2021-recap.md` (in-sync valid PR, skip LLM).
 */
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
 * Explicit `--files` wins over `profile`. `full` returns `undefined` so the loader reads every
 * on-disk `*.md` under `tests/fixtures/md/`.
 *
 * @param profile {@link SmokeProfileId} when `filesArgument` is empty
 * @param filesArgument Comma-separated fixture basenames from `--files`
 *
 * @returns Ordered basenames to load, or `undefined` for the `full` profile
 *
 * @example
 * ```typescript
 * resolveSmokeFixtureBasenames("quick", "");
 * // ^? ["use-memo.md", "react-labs-view-transitions-activity-and-more.md", "lazy.md"]
 * ```
 * @example
 * ```typescript
 * resolveSmokeFixtureBasenames("full", "");
 * // ^? undefined
 * ```
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
