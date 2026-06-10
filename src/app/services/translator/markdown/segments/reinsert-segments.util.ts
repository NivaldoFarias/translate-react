import { extractSegments, filterTranslatableSegments } from "./extract-segments.util";

import type { SegmentExtractionResult, SegmentTranslationMap, TranslatableSegment } from "./types";

/**
 * Normalizes line endings to LF for spike round-trip comparison.
 *
 * @param text Input text
 *
 * @returns LF-normalized text
 */
export function normalizeNewlines(text: string) {
	return text.replace(/\r\n/g, "\n");
}

/**
 * Replaces translatable spans in document order (end-first) for stable offsets.
 *
 * @param source Original markdown
 * @param translations Segment id to translated text map
 * @param segments Segments to apply (typically translate + policy when translating)
 *
 * @returns Document with translated spans spliced in
 */
export function reinsertSegments(
	source: string,
	translations: SegmentTranslationMap,
	segments: readonly TranslatableSegment[],
) {
	const normalized = normalizeNewlines(source);
	const ordered = [...segments].sort((left, right) => right.start - left.start);

	let result = normalized;

	for (const segment of ordered) {
		const replacement = translations[segment.id];
		if (replacement === undefined) {
			continue;
		}

		result = result.slice(0, segment.start) + replacement + result.slice(segment.end);
	}

	return result;
}

/**
 * Applies a deterministic mock translation by appending `[t]` to each translate segment.
 *
 * @param source Original markdown
 *
 * @returns Mock-translated document for structure proof without an LLM
 */
export function mockTranslateSegments(source: string) {
	const extraction = extractSegments(source);
	const translations: Record<string, string> = {};

	for (const segment of filterTranslatableSegments(extraction.segments)) {
		translations[segment.id] = `${segment.sourceText}[t]`;
	}

	return reinsertSegments(source, translations, extraction.segments);
}

/**
 * Proves extract → identity reinsert round-trip on translate-kind segments.
 *
 * @param source Original markdown
 *
 * @returns Whether output matches input (LF-normalized) and extraction metadata
 */
export function identityRoundTrip(source: string) {
	const extraction = extractSegments(source);
	const translations: Record<string, string> = {};

	for (const segment of filterTranslatableSegments(extraction.segments)) {
		translations[segment.id] = segment.sourceText;
	}

	const output = reinsertSegments(source, translations, extraction.segments);
	const ok = normalizeNewlines(output) === normalizeNewlines(source);

	return { ok, output, extraction } satisfies {
		ok: boolean;
		output: string;
		extraction: SegmentExtractionResult;
	};
}
