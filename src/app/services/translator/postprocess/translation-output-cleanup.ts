import type { TranslationFile } from "../translation-file";

import { MARKDOWN_REGEXES } from "../markdown/markdown.regexes";
import { TRANSLATION_PREFIXES } from "../validation/validation.constants";

/** Matches translatable text nodes recorded under an mdast heading */
const HEADING_TEXT_SEGMENT_PATH = /\/heading\[\d+\]\/text\[\d+\](?:#\d+)?$/;

/** Leading markdown heading markers duplicated inside a heading text segment */
const ECHOED_HEADING_MARKERS = /^#{1,6}\s+/;

/** Spurious whitespace between inline code and following punctuation (e.g. `` `word` , ``) */
const INLINE_CODE_BEFORE_PUNCTUATION_SPACING = /`([^`\n]+)`\s+([,.;:!?])/g;

/**
 * Strips common LLM response prefixes from translated text.
 *
 * @param content Raw model output
 * @param trimAfterStrip When true, trims after each prefix removal (full-body path)
 *
 * @returns Content with recognized prefixes removed
 */
function stripTranslationPrefixes(content: string, trimAfterStrip: boolean) {
	let cleaned = content;

	for (const prefix of TRANSLATION_PREFIXES) {
		if (cleaned.trim().toLowerCase().startsWith(prefix.toLowerCase())) {
			cleaned = cleaned.substring(prefix.length);
			if (trimAfterStrip) {
				cleaned = cleaned.trim();
			}
		}
	}

	return cleaned;
}

/**
 * Normalizes line endings to match the reference document.
 *
 * @param content Translated content
 * @param referenceContent Original document used for line-ending detection
 *
 * @returns Content with CRLF when the reference uses CRLF
 */
function applyLineEndings(content: string, referenceContent: string) {
	if (referenceContent.includes("\r\n")) {
		return content.replace(MARKDOWN_REGEXES.lineEnding, "\r\n");
	}

	return content;
}

/**
 * Restores leading and trailing whitespace from the source segment when the model drops it.
 *
 * @param translated Cleaned segment translation
 * @param sourceText Original segment source span
 *
 * @returns Translation with boundary whitespace aligned to the source segment
 */
export function preserveSegmentBoundaryWhitespace(translated: string, sourceText: string) {
	const leadingMatch = /^\s*/.exec(sourceText);
	const trailingMatch = /\s*$/.exec(sourceText);
	const leadingWhitespace = leadingMatch?.[0] ?? "";
	const trailingWhitespace = trailingMatch?.[0] ?? "";

	let restored = translated;

	if (leadingWhitespace.length > 0 && !restored.startsWith(leadingWhitespace)) {
		restored = `${leadingWhitespace}${restored.trimStart()}`;
	}

	if (trailingWhitespace.length > 0 && !restored.endsWith(trailingWhitespace)) {
		restored = `${restored.trimEnd()}${trailingWhitespace}`;
	}

	return restored;
}

/**
 * Cleans a segment snippet without trimming interior boundary whitespace.
 *
 * @param translatedContent Segment translation from the language model
 * @param sourceText Original segment source span
 * @param file File instance for logger context and line-ending reference
 *
 * @returns Cleaned segment text safe for offset reinsertion
 */
export function cleanupSegmentSnippet(
	translatedContent: string,
	sourceText: string,
	file: TranslationFile,
) {
	file.logger.debug(
		{ translatedContentLength: translatedContent.length, sourceTextLength: sourceText.length },
		"Cleaning up translated segment snippet",
	);

	let cleaned = stripTranslationPrefixes(translatedContent, false);
	cleaned = preserveSegmentBoundaryWhitespace(cleaned, sourceText);
	cleaned = normalizeInlineCodeBeforePunctuationSpacing(cleaned);

	return applyLineEndings(cleaned, file.content);
}

/**
 * Removes whitespace between a closing inline-code backtick and trailing punctuation.
 *
 * @param content Markdown body or snippet
 *
 * @returns Content without `` `identifier` , `` style spacing regressions
 */
export function normalizeInlineCodeBeforePunctuationSpacing(content: string) {
	return content.replace(INLINE_CODE_BEFORE_PUNCTUATION_SPACING, "`$1`$2");
}

/**
 * Cleans full-body or frontmatter scalar translations (trim + prefix stripping).
 *
 * @param translatedContent Content returned from the language model
 * @param file File instance for logger context
 *
 * @returns Cleaned translated content with artifacts removed
 */
export function cleanupFullBodyTranslation(translatedContent: string, file: TranslationFile) {
	file.logger.debug(
		{ translatedContentLength: translatedContent.length },
		"Cleaning up translated content",
	);

	let cleaned = stripTranslationPrefixes(translatedContent, true);
	cleaned = cleaned.trim();
	cleaned = normalizeInlineCodeBeforePunctuationSpacing(cleaned);

	file.logger.debug(
		{ originalContentLength: file.content.length, cleanedContentLength: cleaned.length },
		"Adjusting line endings to match original content",
	);

	cleaned = applyLineEndings(cleaned, file.content);

	file.logger.debug(
		{ cleanedContentLength: cleaned.length },
		"Translated content cleanup completed",
	);

	return cleaned;
}

/**
 * Removes common artifacts from full-document translation output.
 *
 * @param translatedContent Content returned from the language model
 * @param file File instance for logger context
 *
 * @returns Cleaned translated content with artifacts removed
 */
export function cleanupTranslatedContent(translatedContent: string, file: TranslationFile) {
	return cleanupFullBodyTranslation(translatedContent, file);
}

/**
 * Returns true when a segment path points at heading prose (not the `##` markers or slug).
 *
 * @param segmentPath Stable mdast path from segment extraction
 *
 * @returns Whether echoed heading markers should be stripped from the translation
 */
export function isHeadingTextSegmentPath(segmentPath: string) {
	return HEADING_TEXT_SEGMENT_PATH.test(segmentPath);
}

/**
 * Removes markdown heading marker prefixes accidentally returned for heading text segments.
 *
 * @param text Translated heading prose
 *
 * @returns Text without a leading `#{1,6} ` prefix
 */
export function stripEchoedHeadingMarkers(text: string) {
	return text.replace(ECHOED_HEADING_MARKERS, "");
}

/**
 * Applies segment-safe cleanup and heading-specific sanitization before reinsertion.
 *
 * @param translated Raw segment translation from the language model
 * @param sourceText Original segment source span
 * @param segmentPath Stable mdast path for the segment
 * @param file File instance for cleanup context
 *
 * @returns Sanitized segment translation ready for {@link reinsertSegments}
 */
export function sanitizeSegmentTranslation(
	translated: string,
	sourceText: string,
	segmentPath: string,
	file: TranslationFile,
) {
	let cleaned = cleanupSegmentSnippet(translated, sourceText, file);

	if (isHeadingTextSegmentPath(segmentPath)) {
		cleaned = stripEchoedHeadingMarkers(cleaned);
	}

	return cleaned;
}
