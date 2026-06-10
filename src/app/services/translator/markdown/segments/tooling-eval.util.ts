import { compile } from "@mdx-js/mdx";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseMdxToMdast } from "./parse-mdx.util";

const PROJECT_ROOT = join(import.meta.dir, "../../../../../../");

/**
 * Compares remark mdast parse vs \`@mdx-js/mdx\` compile on a fixture for the tooling spike.
 *
 * @param fixtureRelative Path under tests/fixtures/md
 *
 * @returns Parse outcomes for both tooling options
 */
export async function evaluateToolingOnFixture(fixtureRelative: string) {
	const source = readFileSync(join(PROJECT_ROOT, "tests/fixtures/md", fixtureRelative), "utf8");

	let remarkNodeCount = 0;
	let remarkError: string | undefined;
	try {
		const tree = parseMdxToMdast(source);
		remarkNodeCount = countNodes(tree);
	} catch (error) {
		remarkError = error instanceof Error ? error.message : String(error);
	}

	let mdxCompileOk = false;
	let mdxError: string | undefined;
	try {
		await compile(source, { development: true });
		mdxCompileOk = true;
	} catch (error) {
		mdxError = error instanceof Error ? error.message : String(error);
	}

	return {
		fixtureRelative,
		remarkNodeCount,
		remarkError,
		mdxCompileOk,
		mdxError,
	};
}

/** Counts mdast nodes in a tree for tooling comparison metrics. */
function countNodes(tree: { children?: unknown[] }): number {
	let count = 1;
	for (const child of tree.children ?? []) {
		if (child && typeof child === "object" && "type" in child) {
			count += countNodes(child as { type?: string; children?: unknown[] });
		}
	}

	return count;
}
