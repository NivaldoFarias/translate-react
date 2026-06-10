import {
	extractSegments,
	filterTranslatableSegments,
} from "@/app/services/translator/markdown/segments/extract-segments.util";
import { reinsertSegments } from "@/app/services/translator/markdown/segments/reinsert-segments.util";
import type { SegmentExtractionResult } from "@/app/services/translator/markdown/segments/types";

/** Normalizes line endings to LF for round-trip comparison */
function normalizeNewlines(text: string) {
	return text.replace(/\r\n/g, "\n");
}

/**
 * Applies a deterministic mock translation by appending `[t]` to each translate segment.
 *
 * @param source Original markdown
 *
 * @returns Mock-translated document for structure proof without an LLM
 */
export function mockTranslateSegments(source: string) {
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- fixture helper uses full-document extraction
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
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- corpus fixtures include frontmatter segments
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
