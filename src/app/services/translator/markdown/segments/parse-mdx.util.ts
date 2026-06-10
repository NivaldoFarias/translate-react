import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { Root } from "mdast";

/**
 * Spike tooling evaluation (#57): remark-parse + remark-mdx + remark-gfm was chosen over
 * \`@mdx-js/mdx\` compile because the spike needs mdast walking and source positions for
 * byte-stable reinsertion; MDX compile targets JS output and does not expose segment walks.
 *
 * Pinned devDependencies (see package.json): unified, remark-parse, remark-mdx, remark-gfm,
 * unist-util-visit, unist-util-position, mdast-util-to-markdown, @mdx-js/mdx (eval only).
 *
 * react.dev alignment: upstream uses MDX v3 / ESM; remark-mdx@3 matches. Version drift with
 * upstream plugins remains a defer risk for production adoption.
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
