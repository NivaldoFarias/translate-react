import { describe, expect, test } from "bun:test";

import { selectFilesForRun } from "@/app/services/runner/workflow/run-limits.util";

import { createTranslationFileFixture } from "@tests/fixtures";

const REFRESH_PATHS = ["src/content/learn/state.md", "src/content/learn/hooks.md"];
const NEW_PATHS = [
	"src/content/reference/react/useState.md",
	"src/content/blog/2025/10/01/react-19-2.md",
	"src/content/learn/index.md",
];

/** Builds the queue in a shuffled order so the tests prove the sort */
function createQueue() {
	return [NEW_PATHS[0], REFRESH_PATHS[0], NEW_PATHS[1], REFRESH_PATHS[1], NEW_PATHS[2]].map(
		(path) => createTranslationFileFixture({ path, filename: path?.split("/").pop() ?? "file.md" }),
	);
}

/** Maps selection groups to their paths for readable assertions */
function selectPaths(maxFilesPerRun: number, maxOpenTranslationPullRequests: number, open: number) {
	const selection = selectFilesForRun({
		files: createQueue(),
		refreshPaths: new Set(REFRESH_PATHS),
		limits: { maxFilesPerRun, maxOpenTranslationPullRequests },
		openTranslationPullRequests: open,
	});

	return {
		selected: selection.selected.map((file) => file.path),
		leftOverByCap: selection.leftOverByCap.map((file) => file.path),
		heldByCeiling: selection.heldByCeiling.map((file) => file.path),
	};
}

describe("selectFilesForRun", () => {
	test("takes refreshes first, then new files, each in path order", () => {
		const result = selectPaths(3, 0, 0);

		expect(result.selected).toEqual([
			"src/content/learn/hooks.md",
			"src/content/learn/state.md",
			"src/content/blog/2025/10/01/react-19-2.md",
		]);
		expect(result.leftOverByCap).toEqual([
			"src/content/learn/index.md",
			"src/content/reference/react/useState.md",
		]);
		expect(result.heldByCeiling).toEqual([]);
	});

	test("selects every file when both limits are 0", () => {
		const result = selectPaths(0, 0, 50);

		expect(result.selected).toHaveLength(5);
		expect(result.leftOverByCap).toEqual([]);
		expect(result.heldByCeiling).toEqual([]);
	});

	test("still refreshes open PRs when the ceiling is reached, holding new files", () => {
		const result = selectPaths(3, 10, 10);

		expect(result.selected).toEqual(["src/content/learn/hooks.md", "src/content/learn/state.md"]);
		expect(result.heldByCeiling).toEqual(["src/content/blog/2025/10/01/react-19-2.md"]);
		expect(result.leftOverByCap).toEqual([
			"src/content/learn/index.md",
			"src/content/reference/react/useState.md",
		]);
	});

	test("opens only as many new PRs as the ceiling has room for", () => {
		const result = selectPaths(0, 10, 9);

		expect(result.selected).toEqual([
			"src/content/learn/hooks.md",
			"src/content/learn/state.md",
			"src/content/blog/2025/10/01/react-19-2.md",
		]);
		expect(result.heldByCeiling).toEqual([
			"src/content/learn/index.md",
			"src/content/reference/react/useState.md",
		]);
		expect(result.leftOverByCap).toEqual([]);
	});

	test("leaves refreshes over the cap for the next run", () => {
		const result = selectPaths(1, 10, 0);

		expect(result.selected).toEqual(["src/content/learn/hooks.md"]);
		expect(result.leftOverByCap).toHaveLength(4);
		expect(result.heldByCeiling).toEqual([]);
	});

	test("treats an open PR count above the ceiling as no room", () => {
		const result = selectPaths(5, 10, 14);

		expect(result.selected).toEqual(["src/content/learn/hooks.md", "src/content/learn/state.md"]);
		expect(result.heldByCeiling).toHaveLength(3);
	});
});
