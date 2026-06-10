import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compile } from "@mdx-js/mdx";

import type { Node } from "unist";

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

/**
 * Counts mdast nodes in a tree for tooling comparison metrics.
 *
 * @param tree mdast root or child subtree
 *
 * @returns Total node count including `tree`
 */
function countNodes(tree: Node): number {
	let count = 1;

	if (!("children" in tree) || !Array.isArray(tree.children)) {
		return count;
	}

	for (const child of tree.children) {
		if (isUnistNode(child)) {
			count += countNodes(child);
		}
	}

	return count;
}

/**
 * Returns true when `value` is a unist node with a string `type`.
 *
 * @param value Candidate child from a parent `children` array
 *
 * @returns Whether `value` can be walked as a `Node`
 */
function isUnistNode(value: unknown): value is Node {
	return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}
