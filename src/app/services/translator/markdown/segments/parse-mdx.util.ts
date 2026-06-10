import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { Root } from "mdast";

/**
 * Production tooling note (#57/#59): remark-parse + remark-mdx + remark-gfm for mdast walking
 * and source positions (byte-stable reinsertion). `@mdx-js/mdx` compile was deferred.
 *
 * react.dev alignment: upstream uses MDX v3 / ESM; remark-mdx@3 matches. Version drift with
 * upstream plugins remains a defer risk.
 */
export const SEGMENT_SPIKE_TOOLING_NOTE =
	"remark-parse + remark-mdx + remark-gfm (mdast walk + positions); @mdx-js/mdx deferred for compile-only use";

/**
 * Parses markdown/MDX source into an mdast root with GFM and MDX extensions enabled.
 *
 * @param source Full or body-only markdown string
 *
 * @returns Parsed mdast root
 */
export function parseMdxToMdast(source: string): Root {
	const processor = unified().use(remarkParse).use(remarkMdx).use(remarkGfm);

	return processor.parse(source);
}
