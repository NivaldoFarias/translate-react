import type { SegmentTranslationMap, TranslatableSegment } from "./types";

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
	const normalized = source.replace(/\r\n/g, "\n");
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
