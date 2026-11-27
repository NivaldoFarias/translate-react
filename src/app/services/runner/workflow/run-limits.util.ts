import type { TranslationFile } from "@/app/services/translator/";

/** Limits applied to one scheduled translation run */
export interface RunLimits {
	/** Files the run may process, refreshes included; `0` removes the cap */
	maxFilesPerRun: number;

	/** Open translation PRs at which the run stops opening new ones; `0` removes the ceiling */
	maxOpenTranslationPullRequests: number;
}

/** Inputs for {@link selectFilesForRun} */
export interface RunSelectionInput {
	/** Files discovery queued for translation */
	files: TranslationFile[];

	/** Paths of queued files that already have an open translation PR (refreshes) */
	refreshPaths: ReadonlySet<string>;

	/** Run limits to apply */
	limits: RunLimits;

	/** Open translation PRs right now; only read when the ceiling is set */
	openTranslationPullRequests: number;
}

/** Files picked for this run and the ones left for later runs */
export interface RunSelection {
	/** Files to process now: refreshes first, then new files, each in path order */
	selected: TranslationFile[];

	/** Files left for a later run because the per-run cap was reached */
	leftOverByCap: TranslationFile[];

	/** New files that fit under the cap but would push open PRs past the ceiling */
	heldByCeiling: TranslationFile[];
}

/**
 * Picks the files one run processes under {@link RunLimits}.
 *
 * Refreshes of open PRs go first and count against the cap, but never against the
 * ceiling, since they don't add a PR. New files fill the remaining cap while open PRs
 * stay below the ceiling. Both groups are sorted by path so consecutive runs drain the
 * backlog in a stable order.
 *
 * @param input Queued files, refresh paths, limits and the current open PR count
 * @param input.files Files discovery queued for translation
 * @param input.refreshPaths Paths of queued files that already have an open translation PR
 * @param input.limits Run limits to apply
 * @param input.openTranslationPullRequests Open translation PRs right now
 *
 * @returns Selected files plus the ones left over by the cap or held by the ceiling
 *
 * @example
 * ```typescript
 * const { selected, heldByCeiling } = selectFilesForRun({
 * 	files,
 * 	refreshPaths: new Set(["src/content/learn/index.md"]),
 * 	limits: { maxFilesPerRun: 3, maxOpenTranslationPullRequests: 10 },
 * 	openTranslationPullRequests: 9,
 * });
 * // ^? selected: the refresh plus one new file; heldByCeiling: the next new file
 * ```
 */
export function selectFilesForRun({
	files,
	refreshPaths,
	limits,
	openTranslationPullRequests,
}: RunSelectionInput): RunSelection {
	const byPath = (a: TranslationFile, b: TranslationFile) =>
		a.path < b.path ? -1
		: a.path > b.path ? 1
		: 0;
	const refreshes = files.filter((file) => refreshPaths.has(file.path)).sort(byPath);
	const newFiles = files.filter((file) => !refreshPaths.has(file.path)).sort(byPath);

	const cap = limits.maxFilesPerRun === 0 ? Infinity : limits.maxFilesPerRun;
	const newPullRequestSlots =
		limits.maxOpenTranslationPullRequests === 0 ?
			Infinity
		:	Math.max(0, limits.maxOpenTranslationPullRequests - openTranslationPullRequests);

	const selectedRefreshes = refreshes.slice(0, cap);
	const capLeftForNewFiles = cap - selectedRefreshes.length;
	const newFilesUnderCap = newFiles.slice(0, capLeftForNewFiles);
	const selectedNewFiles = newFilesUnderCap.slice(0, newPullRequestSlots);

	return {
		selected: [...selectedRefreshes, ...selectedNewFiles],
		leftOverByCap: [...refreshes.slice(cap), ...newFiles.slice(capLeftForNewFiles)],
		heldByCeiling: newFilesUnderCap.slice(newPullRequestSlots),
	};
}
