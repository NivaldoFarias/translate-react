import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { Root } from "mdast";

/**
 * Parses markdown/MDX source into an mdast root with remark-parse, remark-mdx, and remark-gfm.
 *
 * @param source Full or body-only markdown string
 *
 * @returns Parsed mdast root
 */
export function parseMdxToMdast(source: string): Root {
	const processor = unified().use(remarkParse).use(remarkMdx).use(remarkGfm);

	return processor.parse(source);
}
