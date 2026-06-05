import { extractFencedCodeBlockBodies } from "./fence-code-identifier.analyzer";

/** Matches JSX element inner text ending at a named closing tag */
const JSX_ELEMENT_TEXT_BEFORE_CLOSE = new RegExp(
	/>\s*(?<content>[\s\S]*?)\s*<\s*\/\s*[A-Za-z_$][\w$.-]*\s*>/g,
);

/** Removes `{expression}` segments so only static JSX text remains */
const JSX_EXPRESSION = new RegExp(/\{[^{}]*\}/g);

/** One static JSX text segment that changed inside a paired fenced block */
export interface FenceJsxStaticTextMismatch {
	/** 1-based fence index in document order */
	fenceIndex: number;

	/** Static JSX text from the source fence */
	sourceText: string;

	/** Corresponding static JSX text from the translated fence, when present */
	translatedText: string | null;
}

/**
 * Collects static text segments from JSX element bodies inside a code snippet.
 *
 * @param code Fence inner text
 *
 * @returns Static JSX text fragments in document order (expressions removed)
 */
export function collectJsxStaticTextSegments(code: string) {
	const segments: string[] = [];

	for (const match of code.matchAll(JSX_ELEMENT_TEXT_BEFORE_CLOSE)) {
		const content = match.groups?.["content"];
		if (!content) continue;

		for (const segment of content.split(JSX_EXPRESSION)) {
			if (segment.length === 0) continue;

			segments.push(segment);
		}
	}

	return segments;
}

/**
 * Detects static JSX demo text in fenced blocks that was translated or removed.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Mismatches when paired fences differ in static JSX text segments
 */
export function findFenceJsxStaticTextMismatches(
	sourceMarkdown: string,
	translatedMarkdown: string,
) {
	const sourceFences = extractFencedCodeBlockBodies(sourceMarkdown);
	const translatedFences = extractFencedCodeBlockBodies(translatedMarkdown);

	if (sourceFences.length !== translatedFences.length) {
		return [];
	}

	const mismatches: FenceJsxStaticTextMismatch[] = [];

	for (let index = 0; index < sourceFences.length; index++) {
		const sourceFence = sourceFences[index];
		const translatedFence = translatedFences[index];
		if (!sourceFence || translatedFence === undefined) continue;

		const sourceSegments = collectJsxStaticTextSegments(sourceFence);
		const translatedSegments = collectJsxStaticTextSegments(translatedFence);

		for (let segmentIndex = 0; segmentIndex < sourceSegments.length; segmentIndex++) {
			const sourceText = sourceSegments[segmentIndex];
			if (!sourceText) continue;

			const translatedText = translatedSegments[segmentIndex] ?? null;
			if (translatedText === sourceText) continue;

			mismatches.push({
				fenceIndex: index + 1,
				sourceText,
				translatedText,
			});
		}
	}

	return mismatches;
}

/**
 * Lists every static JSX text mismatch for logs, guard errors, and retry hints.
 *
 * @param mismatches Detected JSX static text mismatches
 *
 * @returns Semicolon-separated remediation lines
 */
export function formatFenceJsxStaticTextMismatchSummary(
	mismatches: readonly FenceJsxStaticTextMismatch[],
) {
	return mismatches
		.map(({ fenceIndex, sourceText, translatedText }) => {
			const expected = JSON.stringify(sourceText);
			const actual =
				translatedText === null ? "missing" : `changed to ${JSON.stringify(translatedText)}`;

			return `fence ${fenceIndex}: keep JSX text ${expected} (${actual})`;
		})
		.join("; ");
}

/**
 * Builds a retry hint listing translated JSX demo copy inside fenced code.
 *
 * @param mismatches Detected JSX static text mismatches
 *
 * @returns Hint string for the LLM system prompt
 */
export function buildFenceJsxStaticTextRetryHint(
	mismatches: readonly FenceJsxStaticTextMismatch[],
) {
	const problems = formatFenceJsxStaticTextMismatchSummary(mismatches);
	const problemClause = problems.length > 0 ? ` ${problems}.` : "";

	return `Inside fenced code blocks, do not translate JSX text between tags or demo UI string literals used in examples. Copy static JSX text exactly from the source in English.${problemClause}`;
}
