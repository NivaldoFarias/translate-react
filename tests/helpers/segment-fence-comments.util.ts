import { collectTypeScriptCommentSpans } from "@/app/services/translator/markdown/segments/fence-comments.util";

/**
 * Compares TypeScript comment extraction against a naive regex baseline.
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
