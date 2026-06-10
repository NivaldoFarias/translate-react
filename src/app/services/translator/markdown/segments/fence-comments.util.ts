import ts from "typescript";

import type { SegmentContext, TranslatableSegment } from "./types";

const JS_FENCE_LANGS = new Set(["js", "javascript", "ts", "typescript", "tsx"]);

/**
 * Returns true when the fence language supports TypeScript comment extraction.
 *
 * @param fenceLang GFM fence info string
 *
 * @returns Whether to run the comment sub-spike parser
 */
export function isJsLikeFenceLang(fenceLang: string): boolean {
	const normalized = fenceLang.trim().toLowerCase().split(/\s/)[0] ?? "";
	return JS_FENCE_LANGS.has(normalized);
}

/**
 * Locates double backslash and slash-star comments in a fence body using the TypeScript scanner API.
 *
 * @param fenceBody Inner fenced code block text (after opening line)
 *
 * @returns Comment text spans relative to `fenceBody`
 */
export function collectTypeScriptCommentSpans(fenceBody: string) {
	const scriptKind = fenceBody.includes("<") ? ts.ScriptKind.TSX : ts.ScriptKind.JS;
	let sourceFile: ts.SourceFile;

	try {
		sourceFile = ts.createSourceFile(
			"fence.ts",
			fenceBody,
			ts.ScriptTarget.Latest,
			true,
			scriptKind,
		);
	} catch {
		return [] as { start: number; end: number; text: string }[];
	}

	const spans: { start: number; end: number; text: string }[] = [];
	const seen = new Set<string>();

	const addRange = (start: number, end: number) => {
		const key = `${start}:${end}`;
		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		spans.push({ start, end, text: fenceBody.slice(start, end) });
	};

	const visitNode = (node: ts.Node) => {
		const leading = ts.getLeadingCommentRanges(fenceBody, node.getFullStart());
		for (const range of leading ?? []) {
			addRange(range.pos, range.end);
		}

		const trailing = ts.getTrailingCommentRanges(fenceBody, node.end);
		for (const range of trailing ?? []) {
			addRange(range.pos, range.end);
		}

		ts.forEachChild(node, visitNode);
	};

	visitNode(sourceFile);

	const fileLeading = ts.getLeadingCommentRanges(fenceBody, 0);
	for (const range of fileLeading ?? []) {
		addRange(range.pos, range.end);
	}

	return spans.sort((left, right) => left.start - right.start);
}

/**
 * Builds policy translate sub-segments for comments inside a preserved fenced block.
 *
 * @param fenceBody mdast code node value (inner fence text without delimiters)
 * @param valueStartOffset Absolute document offset where `fenceBody` begins
 * @param fenceLang Fence info string
 * @param path mdast path for the fence
 * @param pathCounters Duplicate id allocator shared with the mdast walk
 * @param context Heading context for the fence
 * @param fullSource Full document source for byte-stable slices
 *
 * @returns Comment segments with absolute document offsets
 */
export function extractFenceCommentSegments(
	fenceBody: string,
	valueStartOffset: number,
	fenceLang: string,
	path: string,
	pathCounters: Map<string, number>,
	context: SegmentContext,
	fullSource: string,
): TranslatableSegment[] {
	if (!isJsLikeFenceLang(fenceLang)) {
		return [];
	}

	const commentSpans = collectTypeScriptCommentSpans(fenceBody);
	const segments: TranslatableSegment[] = [];

	for (const span of commentSpans) {
		const commentPath = `${path}/comment[${span.start}]`;
		const ordinal = pathCounters.get(commentPath) ?? 0;
		pathCounters.set(commentPath, ordinal + 1);

		const absoluteStart = valueStartOffset + span.start;
		const absoluteEnd = valueStartOffset + span.end;

		segments.push({
			id: `${commentPath}#${ordinal}`,
			path: commentPath,
			kind: "policy",
			sourceText: fullSource.slice(absoluteStart, absoluteEnd),
			start: absoluteStart,
			end: absoluteEnd,
			context: {
				...context,
				fenceLang,
				rule: "fence comment only: policy translate (#45 S5)",
			},
		});
	}

	return segments;
}

/**
 * Compares TypeScript comment extraction against a naive regex baseline for the sub-spike.
 *
 * @param fenceBody Inner fence text
 *
 * @returns Parser and regex comment counts for false-positive analysis
 */
export function compareCommentExtractionMethods(fenceBody: string) {
	const parserSpans = collectTypeScriptCommentSpans(fenceBody);
	const regexSpans = [...fenceBody.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g)].map(
		(match) => match[0],
	);

	return {
		parserCount: parserSpans.length,
		regexCount: regexSpans.length,
		parserSpans,
		regexOnlyCount: Math.max(0, regexSpans.length - parserSpans.length),
	};
}
