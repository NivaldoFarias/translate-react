import type { Node } from "unist";

import type { SegmentKind } from "./types";

import {
	isHeading,
	isInsidePreserveAncestor,
	isLink,
	isMdxJsxElement,
	isPreserveAncestor,
	isText,
} from "./mdast-segment.util";

/**
 * Returns the default segment kind for an mdast node during AST walking.
 *
 * @param node Current mdast node
 * @param ancestors Ancestor chain from `visitParents`
 *
 * @returns Classification for inventory tables
 */
export function classifyNode(node: Node, ancestors: readonly Node[]): SegmentKind {
	if (isInsidePreserveAncestor(ancestors) || isPreserveAncestor(node)) {
		return "preserve";
	}

	if (isMdxJsxElement(node)) {
		return "policy";
	}

	if (isText(node)) {
		return "translate";
	}

	if (isLink(node) || isHeading(node) || node.type === "tableCell") {
		return "translate";
	}

	return "preserve";
}

/**
 * One-line inventory rule describing how a node is classified.
 *
 * @param node Current mdast node
 * @param insidePreserveAncestor Whether inside a frozen subtree
 *
 * @returns Human-readable classification rule
 */
export function classificationRuleForNode(node: Node, insidePreserveAncestor: boolean): string {
	if (insidePreserveAncestor) {
		return "inside preserve ancestor: frozen";
	}

	switch (node.type) {
		case "text":
			return "prose text node: translate";
		case "link":
			return "link label children: translate; url frozen at parent";
		case "inlineCode":
			return "inline code: preserve";
		case "code":
			return "fenced block body: preserve (comment sub-segments optional)";
		case "mdxTextExpression":
			return "MDX expression e.g. slug comment: preserve";
		case "mdxJsxFlowElement":
		case "mdxJsxTextElement":
			return "MDX component: policy (children prose translate, attrs policy)";
		case "tableCell":
			return "table cell prose: translate";
		case "heading":
			return "heading text: translate; slug expressions preserve";
		default:
			return `${node.type}: preserve`;
	}
}
