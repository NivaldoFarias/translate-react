import { SKIP, visitParents } from "unist-util-visit-parents";

import type { Heading, Paragraph, PhrasingContent } from "mdast";

import type { AbsoluteSourceSpan } from "./mdast-segment.util";
import type { TranslatableSegment } from "./types";

import { isHeading, isParagraph, sliceAbsoluteSpan } from "./mdast-segment.util";
import { parseMdxToMdast } from "./parse-mdx.util";

/** Matches one opening or closing inline tag: `<c0>`, `</c0>`, `<s1>`, `</s1>` */
const INLINE_TAG = /<(\/?)([cs]\d+)>/g;

/** Matches anything resembling an inline tag, including malformed ones such as `<c0/>` */
const INLINE_TAG_LIKE = /<\/?[cs]\d/;

/** Matches a word character directly before an opening tag or directly after a closing tag */
const GLUED_TAG = /[\p{L}\p{N}]<[cs]\d+>|<\/[cs]\d+>[\p{L}\p{N}]/u;

/** Markdown syntax the model must not introduce: code, emphasis and link targets */
const INTRODUCED_MARKDOWN = ["`", "*", "]("] as const;

/** Source markdown hidden behind one inline tag */
interface InlineTag {
	/** Tag name without brackets: `c0` for code, `s1` for a link or emphasis span */
	readonly name: string;

	/** Tag this one sits inside, or `null` at the top level */
	readonly parent: string | null;

	/** Markdown restored for the opening tag, or the whole code span for `c` tags */
	readonly open: string;

	/** Markdown restored for the closing tag; empty for `c` tags */
	readonly close: string;
}

/** A paragraph or heading sent to the model as one segment with tagged inline markup */
export interface InlineGroupSegment extends TranslatableSegment {
	/** Markup hidden behind each tag in {@link TranslatableSegment.sourceText} */
	readonly inlineTags: readonly InlineTag[];

	/** Original split segments, translated instead when the tagged translation is rejected */
	readonly pieces: readonly TranslatableSegment[];
}

/** Tagged text and the markup it stands for */
interface TaggedInline {
	readonly text: string;
	readonly tags: InlineTag[];
}

/** Open tag while walking a translated group */
interface OpenTag {
	readonly tag: InlineTag;
	content: string;
}

/**
 * Returns whether a segment is an inline group.
 *
 * @param segment Segment to test
 *
 * @returns `true` for groups built by {@link groupInlineSegments}
 */
export function isInlineGroupSegment(segment: TranslatableSegment): segment is InlineGroupSegment {
	return "inlineTags" in segment;
}

/**
 * Tags the inline markup of sibling nodes.
 *
 * @param nodes Phrasing nodes in document order
 * @param body Markdown body the nodes were parsed from
 * @param tags Tags collected so far; new ones are appended
 * @param parent Enclosing tag name, or `null` at the top level
 *
 * @returns Tagged text, or `null` when a node cannot be represented safely
 */
function tagInlineNodes(
	nodes: readonly PhrasingContent[],
	body: string,
	tags: InlineTag[],
	parent: string | null,
): string | null {
	let text = "";

	for (const node of nodes) {
		const span = sliceAbsoluteSpan(body, 0, node);
		if (!span) return null;

		switch (node.type) {
			case "text": {
				if (INLINE_TAG_LIKE.test(span.sourceText)) return null;

				text += span.sourceText;
				break;
			}

			case "inlineCode": {
				const name = `c${tags.length}`;
				tags.push({ name, parent, open: span.sourceText, close: "" });
				text += `<${name}>${node.value}</${name}>`;
				break;
			}

			case "link":
			case "emphasis":
			case "strong":
			case "delete": {
				const first = node.children[0];
				const last = node.children.at(-1);
				const firstSpan = first && sliceAbsoluteSpan(body, 0, first);
				const lastSpan = last && sliceAbsoluteSpan(body, 0, last);
				if (!firstSpan || !lastSpan) return null;

				const open = body.slice(span.start, firstSpan.start);
				if (node.type === "link" && open !== "[") return null;

				const name = `s${tags.length}`;
				tags.push({ name, parent, open, close: body.slice(lastSpan.end, span.end) });

				const inner = tagInlineNodes(node.children, body, tags, name);
				if (inner === null) return null;

				text += `<${name}>${inner}</${name}>`;
				break;
			}

			default:
				return null;
		}
	}

	return text;
}

/**
 * Returns the phrasing children to group, leaving a heading's trailing slug expression out.
 *
 * @param container Paragraph or heading node
 *
 * @returns Children covered by the group
 */
function selectGroupedChildren(container: Heading | Paragraph) {
	const hasTrailingSlug =
		isHeading(container) && container.children.at(-1)?.type === "mdxTextExpression";

	return hasTrailingSlug ? container.children.slice(0, -1) : container.children;
}

/**
 * Computes the tagged form and source span of a paragraph or heading.
 *
 * @param container Paragraph or heading node
 * @param body Markdown body the node was parsed from
 *
 * @returns Tagged inline and span, or `null` when the container must stay split
 */
function tagContainer(
	container: Heading | Paragraph,
	body: string,
): (TaggedInline & { readonly span: AbsoluteSourceSpan }) | null {
	const children = selectGroupedChildren(container);
	const first = children[0];
	const last = children.at(-1);
	const firstSpan = first && sliceAbsoluteSpan(body, 0, first);
	const lastSpan = last && sliceAbsoluteSpan(body, 0, last);
	if (!firstSpan || !lastSpan) return null;

	const tags: InlineTag[] = [];
	const tagged = tagInlineNodes(children, body, tags, null);
	if (tagged === null || tags.length === 0) return null;

	const text = tagged.trimEnd();
	const end = lastSpan.end - (tagged.length - text.length);

	return {
		text,
		tags,
		span: { start: firstSpan.start, end, sourceText: body.slice(firstSpan.start, end) },
	};
}

/**
 * Replaces the split segments of each paragraph and heading that has inline markup with one
 * tagged segment, so the model can reorder words around code, links and emphasis.
 *
 * Containers with markup that cannot be tagged, or whose tagged source does not restore to the
 * exact original, keep their split segments.
 *
 * @param body Markdown body the segments were extracted from
 * @param segments Extracted segments in document order
 *
 * @returns Segments in document order with eligible containers grouped
 *
 * @example
 * ```typescript
 * const [group] = groupInlineSegments(body, segments);
 * // "After a conditional <c0>return</c0> statement."
 * ```
 */
export function groupInlineSegments(
	body: string,
	segments: readonly TranslatableSegment[],
): TranslatableSegment[] {
	const normalized = body.replace(/\r\n/g, "\n");
	const groups: InlineGroupSegment[] = [];

	visitParents(parseMdxToMdast(normalized), (node) => {
		if (!isHeading(node) && !isParagraph(node)) return;

		const container = sliceAbsoluteSpan(normalized, 0, node);
		const tagged = tagContainer(node, normalized);
		if (!container || !tagged) return SKIP;

		const { span, text, tags } = tagged;
		const pieces = segments.filter(
			(segment) => segment.start >= span.start && segment.end <= container.end,
		);
		const [firstPiece] = pieces;
		if (!firstPiece) return SKIP;

		const group: InlineGroupSegment = {
			id: `${firstPiece.id}/inline`,
			path: firstPiece.path,
			kind: "translate",
			sourceText: text,
			start: span.start,
			end: span.end,
			context: firstPiece.context,
			inlineTags: tags,
			pieces,
		};

		if (restoreInlineGroup(text, group) === span.sourceText) {
			groups.push(group);
		}

		return SKIP;
	});

	const groupByFirstPiece = new Map(groups.map((group) => [group.pieces[0]?.id, group]));
	const groupedIds = new Set(groups.flatMap((group) => group.pieces.map((piece) => piece.id)));

	return segments.flatMap((segment) => {
		const group = groupByFirstPiece.get(segment.id);
		if (group) return [group];

		return groupedIds.has(segment.id) ? [] : [segment];
	});
}

/**
 * Restores source markdown in a translated group.
 *
 * Rejects a translation unless every tag appears exactly once, correctly nested, inside the same
 * parent as in the source, line breaks match, and the model added no markdown of its own. Code always comes back
 * verbatim, even when the model translated the text inside its tag.
 *
 * @param translated Tagged translation from the model
 * @param group Group the translation belongs to
 *
 * @returns Restored markdown, or `null` when the translation is rejected
 */
export function restoreInlineGroup(translated: string, group: InlineGroupSegment): string | null {
	if (GLUED_TAG.test(translated) && !GLUED_TAG.test(group.sourceText)) return null;

	if (countLines(translated) !== countLines(group.sourceText)) return null;

	const tagByName = new Map(group.inlineTags.map((tag) => [tag.name, tag]));
	const sourceProse = stripInlineTags(group.sourceText);
	const translatedProse = stripInlineTags(translated);
	const introducesMarkdown = INTRODUCED_MARKDOWN.some(
		(syntax) => translatedProse.includes(syntax) && !sourceProse.includes(syntax),
	);

	if (introducesMarkdown || INLINE_TAG_LIKE.test(translatedProse)) return null;

	const seen = new Set<string>();
	const stack: OpenTag[] = [];
	let output = "";
	let cursor = 0;

	const append = (text: string) => {
		const current = stack.at(-1);
		if (current) current.content += text;
		else output += text;
	};

	for (const match of translated.matchAll(INLINE_TAG)) {
		const [raw, slash, name = ""] = match;
		append(translated.slice(cursor, match.index));
		cursor = match.index + raw.length;

		if (!slash) {
			const tag = tagByName.get(name);
			const parent = stack.at(-1)?.tag.name ?? null;
			if (!tag || seen.has(name) || tag.parent !== parent) return null;

			seen.add(name);
			stack.push({ tag, content: "" });
			continue;
		}

		const closed = stack.pop();
		if (closed?.tag.name !== name) return null;

		if (closed.tag.name.startsWith("c")) {
			append(closed.tag.open);
			continue;
		}

		const hasUnsafeLabel = closed.content.length === 0 || closed.content !== closed.content.trim();
		if (hasUnsafeLabel) return null;

		append(`${closed.tag.open}${closed.content}${closed.tag.close}`);
	}

	if (stack.length > 0 || seen.size !== group.inlineTags.length) return null;

	append(translated.slice(cursor));

	return output;
}

/**
 * Counts the lines of a text.
 *
 * @param text Text to count
 *
 * @returns Number of lines
 */
function countLines(text: string) {
	return text.split(/\r?\n/).length;
}

/**
 * Removes tags and the code between code tags, leaving prose the model wrote.
 *
 * @param text Tagged text
 *
 * @returns Prose without tags or code
 */
function stripInlineTags(text: string) {
	return text.replace(/<(c\d+)>[\s\S]*?<\/\1>/g, "").replace(INLINE_TAG, "");
}
