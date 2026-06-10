import { visitParents } from "unist-util-visit-parents";

import type { Link, Root } from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import type { Node } from "unist";

import type { AbsoluteSourceSpan } from "./mdast-segment.util";
import type {
	BodySegmentExtractionResult,
	SegmentContext,
	SegmentExtractionResult,
	TranslatableSegment,
} from "./types";

import {
	extractDescriptionScalarFromInnerYaml,
	extractFrontmatterParts,
	splitLeadingYamlFrontmatter,
} from "../frontmatter";

import { classificationRuleForNode } from "./classify.util";
import { extractFenceCommentSegments } from "./fence-comments.util";
import {
	buildNodePath,
	collectHeadingPlainText,
	collectLinkLabelTexts,
	isCode,
	isHeading,
	isInsideLinkAncestor,
	isInsidePreserveAncestor,
	isLink,
	isMdxJsxAttribute,
	isMdxJsxElement,
	isText,
	resolveCodeValueStartOffset,
	sliceAbsoluteSpan,
} from "./mdast-segment.util";
import { parseMdxToMdast } from "./parse-mdx.util";

interface WalkState {
	readonly segments: TranslatableSegment[];
	readonly parseWarnings: string[];
	readonly pathCounters: Map<string, number>;
	readonly offsetBase: number;
	readonly fullSource: string;
	currentHeading?: string;
}

/**
 * Allocates a unique segment id for a path, incrementing duplicates (S8).
 *
 * @param state Mutable walk state
 * @param path Node path string
 *
 * @returns Segment id
 */
function allocateSegmentId(state: WalkState, path: string): string {
	const ordinal = state.pathCounters.get(path) ?? 0;
	state.pathCounters.set(path, ordinal + 1);

	return `${path}#${ordinal}`;
}

/**
 * Records a segment from an absolute source span when text is non-empty.
 *
 * @param state Mutable walk state
 * @param span Absolute document span with `start`, `end`, and `sourceText`
 * @param kind Segment classification
 * @param path Node path
 * @param node mdast node for classification rule lookup
 * @param context Optional segment context
 */
function pushSpanSegment(
	state: WalkState,
	span: AbsoluteSourceSpan,
	kind: TranslatableSegment["kind"],
	path: string,
	node: Node,
	context?: SegmentContext,
) {
	if (span.sourceText.trim().length === 0) {
		return;
	}

	state.segments.push({
		id: allocateSegmentId(state, path),
		path,
		kind,
		sourceText: span.sourceText,
		start: span.start,
		end: span.end,
		context: {
			...context,
			rule: context?.rule ?? classificationRuleForNode(node, false),
		},
	});
}

/**
 * Records a segment when the node has source positions and non-empty text.
 *
 * @param state Mutable walk state
 * @param node mdast node with position
 * @param kind Segment classification
 * @param path Node path
 * @param context Optional segment context
 */
function pushNodeSegment(
	state: WalkState,
	node: Node,
	kind: TranslatableSegment["kind"],
	path: string,
	context?: SegmentContext,
) {
	const span = sliceAbsoluteSpan(state.fullSource, state.offsetBase, node);

	if (!span) {
		state.parseWarnings.push(`missing position for ${path}`);
		return;
	}

	pushSpanSegment(state, span, kind, path, node, context);
}

/**
 * Extracts a translatable `description` scalar from YAML frontmatter when present.
 *
 * @param fullSource Complete markdown document
 * @param block Leading frontmatter block including fences
 *
 * @returns Description segment or null when absent
 */
function extractFrontmatterDescriptionSegment(
	fullSource: string,
	block: string,
): TranslatableSegment | null {
	const parts = extractFrontmatterParts(block);
	if (!parts) {
		return null;
	}

	const value = extractDescriptionScalarFromInnerYaml(parts.inner);
	if (!value) {
		return null;
	}

	const innerOffset = block.indexOf(parts.inner);
	if (innerOffset === -1) {
		return null;
	}

	const valueOffsetInInner = parts.inner.indexOf(value);
	if (valueOffsetInInner === -1) {
		return null;
	}

	const start = innerOffset + valueOffsetInInner;
	const end = start + value.length;

	return {
		id: "frontmatter/description#0",
		path: "frontmatter/description",
		kind: "translate",
		sourceText: fullSource.slice(start, end),
		start,
		end,
		context: {
			rule: "YAML description value: translate; title and keys frozen",
		},
	};
}

/**
 * Extracts string-literal MDX JSX attributes as policy segments.
 *
 * @param state Mutable walk state
 * @param element MDX JSX flow or text element
 * @param componentPath Path prefix for the component node
 * @param context Segment context
 */
function extractMdxAttributeSegments(
	state: WalkState,
	element: MdxJsxFlowElement | MdxJsxTextElement,
	componentPath: string,
	context: SegmentContext,
) {
	for (const attribute of element.attributes) {
		if (!isMdxJsxAttribute(attribute)) {
			continue;
		}

		if (typeof attribute.value !== "string" || attribute.value.trim().length === 0) {
			continue;
		}

		const path = `${componentPath}/@${attribute.name}`;
		pushNodeSegment(state, attribute, "policy", path, {
			...context,
			rule: "MDX JSX string attribute: policy (#45)",
		});
	}
}

/**
 * Records one translate segment spanning the full link label child text run.
 *
 * @param state Mutable walk state
 * @param link mdast link node
 * @param path Node path
 * @param context Segment context
 */
function pushLinkLabelSegment(state: WalkState, link: Link, path: string, context: SegmentContext) {
	const textChildren = collectLinkLabelTexts(link);
	if (textChildren.length === 0) {
		return;
	}

	const first = textChildren[0];
	const last = textChildren.at(-1);

	if (!first || !last) {
		return;
	}

	const labelStart = sliceAbsoluteSpan(state.fullSource, state.offsetBase, first);
	const labelEnd = sliceAbsoluteSpan(state.fullSource, state.offsetBase, last);

	if (!labelStart || !labelEnd) {
		state.parseWarnings.push(`missing link label position for ${path}`);
		return;
	}

	pushSpanSegment(
		state,
		{
			start: labelStart.start,
			end: labelEnd.end,
			sourceText: state.fullSource.slice(labelStart.start, labelEnd.end),
		},
		"translate",
		`${path}/label`,
		link,
		{
			...context,
			rule: "link label children: translate; url frozen at parent",
		},
	);
}

/**
 * Walks mdast and collects translatable segments with absolute source offsets.
 *
 * @param body Markdown body without frontmatter
 * @param offsetBase Character offset where the body starts in the full document
 * @param fullSource Complete document for byte-stable slices
 *
 * @returns Segments and parse warnings from the body walk
 */
function extractBodySegments(body: string, offsetBase: number, fullSource: string) {
	const state: WalkState = {
		segments: [],
		parseWarnings: [],
		pathCounters: new Map(),
		offsetBase,
		fullSource,
	};

	let tree: Root;
	try {
		tree = parseMdxToMdast(body);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			segments: [] as TranslatableSegment[],
			parseWarnings: [`parse failed: ${message}`],
		};
	}

	visitParents(tree, (node, ancestors) => {
		const path = buildNodePath([...ancestors, node]);
		const insidePreserve = isInsidePreserveAncestor(ancestors);
		const context: SegmentContext = {
			heading: state.currentHeading,
			fenceLang: isCode(node) ? (node.lang ?? undefined) : undefined,
		};

		if (isHeading(node)) {
			const plain = collectHeadingPlainText(node);
			if (plain.length > 0) {
				state.currentHeading = plain;
			}
		}

		if (isCode(node)) {
			const valueStartOffset = resolveCodeValueStartOffset(body, node, state.offsetBase);

			state.segments.push(
				...extractFenceCommentSegments(
					node.value,
					valueStartOffset,
					node.lang ?? "",
					path,
					state.pathCounters,
					context,
					state.fullSource,
				),
			);
		}

		if (isMdxJsxElement(node)) {
			extractMdxAttributeSegments(state, node, path, context);
		}

		if (isLink(node)) {
			pushLinkLabelSegment(state, node, path, context);
		}

		if (isText(node) && !insidePreserve && !isInsideLinkAncestor(ancestors)) {
			pushNodeSegment(state, node, "translate", path, context);
		}
	});

	return { segments: state.segments, parseWarnings: state.parseWarnings };
}

/**
 * Extracts translatable segments from a markdown body without frontmatter.
 *
 * Used by the default segment translation path so `description` is not translated twice
 * (frontmatter stays on the dedicated metadata pass in `finalizeTranslation`).
 *
 * @param body Markdown body after frontmatter split
 *
 * @returns Body segments and parse warnings
 *
 * @example
 * ```typescript
 * const { segments } = extractTranslatableBodySegments("# Hello\n\nWorld");
 * ```
 */
export function extractTranslatableBodySegments(body: string): BodySegmentExtractionResult {
	const normalized = body.replace(/\r\n/g, "\n");
	return extractBodySegments(normalized, 0, normalized);
}

/**
 * Extracts all translatable segments from a markdown document including optional frontmatter.
 *
 * @param source Full markdown source including optional frontmatter
 *
 * @returns Segments, structural splits, and parse warnings
 *
 * @example
 * ```typescript
 * const result = extractSegments("---\ntitle: x\ndescription: y\n---\n\nHello");
 * // result.segments includes description + "Hello"
 * ```
 *
 * @deprecated For production translation use {@link extractTranslatableBodySegments} on the body
 * only so frontmatter `description` is not translated twice. Retained for spike fixtures, corpus
 * metrics, and identity round-trip tests on full documents.
 */
export function extractSegments(source: string): SegmentExtractionResult {
	const normalized = source.replace(/\r\n/g, "\n");
	const { block, rest } = splitLeadingYamlFrontmatter(normalized);
	const parseWarnings: string[] = [];

	const segments: TranslatableSegment[] = [];

	if (block) {
		const descriptionSegment = extractFrontmatterDescriptionSegment(normalized, block);
		if (descriptionSegment) {
			segments.push(descriptionSegment);
		}
	}

	const bodyOffset = block.length;
	const { segments: bodySegments, parseWarnings: bodyWarnings } = extractBodySegments(
		rest,
		bodyOffset,
		normalized,
	);

	segments.push(...bodySegments);
	parseWarnings.push(...bodyWarnings);

	return {
		segments,
		frontmatterBlock: block,
		body: rest,
		parseWarnings,
		tooling: "remark-mdx",
	};
}

/**
 * Returns only segments classified as translate (policy excluded by default).
 *
 * @param segments All extracted segments
 * @param includePolicy When true, policy segments count as translatable for metrics
 *
 * @returns Filtered segment list
 */
export function filterTranslatableSegments(
	segments: readonly TranslatableSegment[],
	includePolicy = false,
) {
	return segments.filter(
		(segment) => segment.kind === "translate" || (includePolicy && segment.kind === "policy"),
	);
}

/**
 * Sums character lengths of translate-kind segments.
 *
 * @param segments Extracted segments
 *
 * @returns Total translatable character count
 */
export function sumTranslatableChars(segments: readonly TranslatableSegment[]) {
	return filterTranslatableSegments(segments).reduce(
		(total, segment) => total + segment.sourceText.length,
		0,
	);
}
