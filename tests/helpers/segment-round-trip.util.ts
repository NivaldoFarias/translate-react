import type { SegmentExtractionResult } from "@/app/services/translator/markdown/segments/types";

import { splitLeadingYamlFrontmatter } from "@/app/services/translator/markdown/frontmatter";
import {
	extractSegments,
	extractTranslatableBodySegments,
	filterTranslatableSegments,
} from "@/app/services/translator/markdown/segments/extract-segments.util";
import { reinsertSegments } from "@/app/services/translator/markdown/segments/reinsert-segments.util";
import { sanitizeSegmentTranslation } from "@/app/services/translator/postprocess/translation-output-cleanup";
import { TranslationFile } from "@/app/services/translator/translation-file";

/**
 * Normalizes line endings to LF for round-trip comparison.
 *
 * @param text The text to normalize
 *
 * @returns The normalized text
 */
function normalizeNewlines(text: string) {
	return text.replace(/\r\n/g, "\n");
}

/**
 * Applies a deterministic mock translation by appending `[t]` to each translate segment.
 *
 * @param source Original markdown
 *
 * @returns The mock-translated document for structure proof without an LLM
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
 * Applies production segment cleanup and sanitization before reinsertion.
 *
 * @param source Original markdown body
 * @param translate Callback that maps each translatable segment source to model output
 *
 * @returns The mock-translated document using the production segment cleanup path
 */
export function mockTranslateWithProductionCleanup(
	source: string,
	translate: (segmentSource: string, segmentPath: string) => string,
) {
	const normalized = source.replace(/\r\n/g, "\n");
	const { block, rest } = splitLeadingYamlFrontmatter(normalized);
	const extraction = extractTranslatableBodySegments(rest);
	const translations: Record<string, string> = {};
	const file = new TranslationFile(
		source,
		"test.md",
		"src/content/test.md",
		"sha",
		undefined,
		"en",
	);

	for (const segment of filterTranslatableSegments(extraction.segments)) {
		translations[segment.id] = sanitizeSegmentTranslation(
			translate(segment.sourceText, segment.path),
			segment.sourceText,
			segment.path,
			file,
		);
	}

	const translatedBody = reinsertSegments(rest, translations, extraction.segments);

	return block ? `${block}${translatedBody}` : translatedBody;
}

/**
 * Proves extract → identity reinsert round-trip on translate-kind segments.
 *
 * @param source The source markdown
 *
 * @returns Whether the output matches the input (LF-normalized) and extraction metadata
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
