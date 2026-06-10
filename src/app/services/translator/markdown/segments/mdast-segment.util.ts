import { pointEnd, pointStart } from "unist-util-position";

import type { Code, Heading, Html, InlineCode, Link, Text } from "mdast";
import type { MdxFlowExpression, MdxTextExpression } from "mdast-util-mdx-expression";
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import type { Node, Parent } from "unist";

/** mdast node types whose descendants are never translatable at the AST level */
export type PreserveAncestorType =
	| Code["type"]
	| InlineCode["type"]
	| Html["type"]
	| MdxFlowExpression["type"]
	| MdxTextExpression["type"];

/** Parent node types whose descendants are never translatable at the mdast level */
export const PRESERVE_ANCESTOR_TYPES = new Set<PreserveAncestorType>([
	"code",
	"inlineCode",
	"mdxFlowExpression",
	"mdxTextExpression",
	"html",
]);

/** Policy-classified MDX JSX wrapper element types */
export type PolicyMdxJsxType = MdxJsxFlowElement["type"] | MdxJsxTextElement["type"];

/** Absolute source span for byte-stable segment reinsertion */
export interface AbsoluteSourceSpan {
	readonly start: number;
	readonly end: number;
	readonly sourceText: string;
}

/**
 * Returns true when `node` is a fenced code block.
 *
 * @param node Unist node to test
 *
 * @returns Whether `node` is an mdast `code` node
 */
export function isCode(node: Node): node is Code {
	return node.type === "code";
}

/**
 * Returns true when `node` is a markdown link.
 *
 * @param node Unist node to test
 *
 * @returns Whether `node` is an mdast `link` node
 */
export function isLink(node: Node): node is Link {
	return node.type === "link";
}

/**
 * Returns true when `node` is a heading.
 *
 * @param node Unist node to test
 *
 * @returns Whether `node` is an mdast `heading` node
 */
export function isHeading(node: Node): node is Heading {
	return node.type === "heading";
}

/**
 * Returns true when `node` is a prose text leaf.
 *
 * @param node Unist node to test
 *
 * @returns Whether `node` is an mdast `text` node
 */
export function isText(node: Node): node is Text {
	return node.type === "text";
}

/**
 * Returns true when `node` is an MDX JSX flow or text element.
 *
 * @param node Unist node to test
 *
 * @returns Whether `node` is an `mdxJsxFlowElement` or `mdxJsxTextElement`
 */
export function isMdxJsxElement(node: Node): node is MdxJsxFlowElement | MdxJsxTextElement {
	return node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
}

/**
 * Returns true when `node` is an MDX JSX attribute.
 *
 * @param node Unist node to test
 *
 * @returns Whether `node` is an `mdxJsxAttribute` node
 */
export function isMdxJsxAttribute(node: Node): node is MdxJsxAttribute {
	return node.type === "mdxJsxAttribute";
}

/**
 * Returns true when `node` is a preserve-only ancestor type.
 *
 * @param node Unist node to test
 *
 * @returns Whether descendants of `node` must not be translated at the mdast level
 */
export function isPreserveAncestor(node: Node): node is Node & { type: PreserveAncestorType } {
	return PRESERVE_ANCESTOR_TYPES.has(node.type as PreserveAncestorType);
}

/**
 * Returns whether any ancestor is a preserve-only mdast node type.
 *
 * @param ancestors Ancestor chain from `visitParents`
 *
 * @returns True when inside code, inline code, or MDX expression
 */
export function isInsidePreserveAncestor(ancestors: readonly Node[]): boolean {
	return ancestors.some(isPreserveAncestor);
}

/**
 * Returns whether the node sits inside a markdown link (label handled at link level).
 *
 * @param ancestors Ancestor chain from `visitParents`
 *
 * @returns True when a link ancestor exists
 */
export function isInsideLinkAncestor(ancestors: readonly Node[]): boolean {
	return ancestors.some(isLink);
}

/**
 * Builds a stable path from the ancestor chain.
 *
 * @param ancestors Ancestor chain including the current node
 *
 * @returns Path like `root[0]/paragraph[1]/text[0]`
 */
export function buildNodePath(ancestors: readonly Node[]): string {
	return ancestors
		.map((ancestor, index) => {
			if (index === 0) {
				return ancestor.type;
			}

			const parent = ancestors[index - 1] as Parent;
			const childIndex = parent.children.indexOf(ancestor);
			return `${ancestor.type}[${childIndex}]`;
		})
		.join("/");
}

/**
 * Slices `fullSource` at a node's unist position with an optional document offset base.
 *
 * @param fullSource Complete markdown document
 * @param offsetBase Body offset when walking a frontmatter-split remainder
 * @param node mdast node carrying `position`
 *
 * @returns Absolute span or null when offsets are missing
 */
export function sliceAbsoluteSpan(
	fullSource: string,
	offsetBase: number,
	node: Node,
): AbsoluteSourceSpan | null {
	const startOffset = pointStart(node)?.offset;
	const endOffset = pointEnd(node)?.offset;

	if (startOffset === undefined || endOffset === undefined) {
		return null;
	}

	const start = offsetBase + startOffset;
	const end = offsetBase + endOffset;

	return {
		start,
		end,
		sourceText: fullSource.slice(start, end),
	};
}

/**
 * Collects text children from a link label for combined segment extraction.
 *
 * @param link mdast link node
 *
 * @returns Text nodes inside the label
 */
export function collectLinkLabelTexts(link: Link) {
	return link.children.filter((child): child is Text => isText(child));
}

/**
 * Collects plain heading text, excluding MDX slug expressions.
 *
 * @param heading mdast heading node
 *
 * @returns Heading text for segment context metadata
 */
export function collectHeadingPlainText(heading: Heading) {
	return heading.children
		.filter((child): child is Text => isText(child))
		.map((child) => child.value)
		.join("")
		.trim();
}

/**
 * Resolves the absolute document offset where a code node's `value` begins.
 *
 * @param body Markdown body slice used for parsing
 * @param code mdast code node
 * @param offsetBase Body offset in the full document
 *
 * @returns Absolute offset of the inner fence text
 */
export function resolveCodeValueStartOffset(body: string, code: Code, offsetBase: number) {
	const codeStart = pointStart(code)?.offset;
	const codeEnd = pointEnd(code)?.offset;

	if (codeStart === undefined || codeEnd === undefined) {
		return offsetBase;
	}

	const fenceSlice = body.slice(codeStart, codeEnd);
	const valueIndexInFence = fenceSlice.indexOf(code.value);

	if (valueIndexInFence === -1) {
		return offsetBase + codeStart;
	}

	return offsetBase + codeStart + valueIndexInFence;
}
