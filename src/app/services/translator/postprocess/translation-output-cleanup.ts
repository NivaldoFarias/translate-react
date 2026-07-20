import type { TranslationFile } from "../translation-file";

import { MARKDOWN_REGEXES } from "../markdown/markdown.regexes";
import { reinsertSegments } from "../markdown/segments/reinsert-segments.util";
import { TRANSLATION_PREFIXES } from "../validation/validation.constants";

/**
 * Matches an inline code span immediately followed by a prose letter (no whitespace separator).
 *
 * The first character after the opening backtick must be non-whitespace so that a sequence
 * like a closing backtick, prose, and an opening backtick is not incorrectly interpreted
 * as a single code span when two spans appear near each other:
 *
 * ```
 * ` and `word
 * ```
 *
 * Only glued spans such as the following are matched:
 *
 * ```
 * `code`word
 * ```
 */
const INLINE_CODE_GLUED_TO_PROSE = /(`[^`\n\s][^`\n]*`)(\p{L})/gu;

/** Matches one inline code span (no nested backticks) */
const INLINE_CODE_SPAN = /`[^`\n]+`/g;

/** Matches a markdown link label with optional leading or trailing whitespace inside brackets */
const MARKDOWN_LINK_WITH_SPACED_LABEL = /\[(\s*[^\]]*?\s*)\]\(([^)]+)\)/g;

/** Matches duplicated whitespace immediately after a markdown heading marker */
const HEADING_MARKER_EXTRA_SPACING = /^(#{1,6})\s{2,}/gm;

/**
 * Matches the locale segment in an MDN docs URL (`en-US`, `pt-BR`, `ru`, …).
 *
 * Limited to lowercase ISO-like slugs to keep matching bounded.
 */
const MDN_DOCS_URL_LOCALE = /https:\/\/developer\.mozilla\.org\/[a-z]{2}(?:-[A-Z]{2})?(?=\/)/g;

/** Matches a non-whitespace character immediately before an MDX slug comment opener */
const PROSE_GLUED_TO_MDX_SLUG = /(\S)(\{\/\*)/g;

/** Matches adjacent markdown links with no whitespace separator */
const ADJACENT_LINKS_NO_SPACE = /\],\[/g;

/** Matches translatable text nodes recorded under an mdast heading */
const HEADING_TEXT_SEGMENT_PATH = /\/heading\[\d+\]\/text\[\d+\](?:#\d+)?$/;

/**
 * Matches a `'use client'` or `'use server'` inline code span followed by a echoed guillemet directive.
 *
 * ```
 * `'use client'` «use client»
 * ```
 */
const ECHOED_USE_DIRECTIVE_GUILLEMETS =
	/(`['"]use (?:client|server)['"]`)\s*«use (?:client|server)»/gi;

/** Matches a duplicated English lead-in before a comma after `'use client'` */
const DUPLICATED_ENGLISH_USE_CLIENT_LEAD_IN = /(\bWith\s+`'use client'`)\s+With\s*,/gi;

/** Leading markdown heading markers duplicated inside a heading text segment */
const ECHOED_HEADING_MARKERS = /^#{1,6}\s+/;

/**
 * Spurious whitespace between inline code and following punctuation.
 *
 * ```
 * `word` ,
 * ```
 */
const INLINE_CODE_BEFORE_PUNCTUATION_SPACING = /`([^`\n]+)`\s+([,.;:!?])/g;

/**
 * Spurious whitespace between a markdown link and following punctuation.
 *
 * ```
 * [DOM API](url) ,
 * ```
 */
const MARKDOWN_LINK_BEFORE_PUNCTUATION_SPACING = /(\]\([^)]+\))\s+([,.;:!?])/g;

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
	cleaned = normalizeInlineCodeInteriorSpacing(cleaned);
	cleaned = normalizeInlineCodeBeforePunctuationSpacing(cleaned);

	return applyLineEndings(cleaned, file.content);
}

/**
 * Removes whitespace between a closing inline-code backtick and trailing punctuation.
 *
 * ```
 * `identifier` ,
 * ```
 *
 * @param content Markdown body or snippet
 *
 * @returns Content without spurious whitespace between inline code and trailing punctuation
 */
export function normalizeInlineCodeBeforePunctuationSpacing(content: string) {
	return content.replace(INLINE_CODE_BEFORE_PUNCTUATION_SPACING, "`$1`$2");
}

/**
 * Removes whitespace between a markdown link and trailing punctuation.
 *
 * @param content Markdown body or snippet
 *
 * @returns Content without spurious whitespace after markdown links before punctuation
 */
export function normalizeMarkdownLinkBeforePunctuationSpacing(content: string) {
	return content.replace(MARKDOWN_LINK_BEFORE_PUNCTUATION_SPACING, "$1$2");
}

/**
 * Returns whether an inline code span contains identifier-like content worth gluing repairs.
 *
 * @param span Full inline code span including backticks
 *
 * @returns `true` when the span interior includes a letter, digit, or underscore
 */
function isRepairableInlineCodeSpan(span: string) {
	const inner = span.slice(1, -1);

	return inner.length > 0 && /[\p{L}\p{N}_]/u.test(inner);
}

/**
 * Mechanically repairs MDX spacing regressions introduced during translation.
 *
 * Applies deterministic space insertion for three language-agnostic structural patterns:
 *
 * ```
 * `code`word
 * ```
 *
 * ```
 * text{/*
 * ```
 *
 * ```
 * ],[
 * ```
 *
 * Vocabulary-specific heuristics (e.g. locale-word-before-link) are intentionally
 * excluded — those belong in locale prompt rules, not a mechanical pass.
 *
 * Runs before advisory guards so these deterministic regressions do not produce
 * `mdxSpacing` reviewer notices.
 *
 * @param content Assembled translated markdown document
 *
 * @returns Document with MDX spacing regressions repaired
 */
export function repairMdxSpacing(content: string) {
	return content
		.replace(INLINE_CODE_GLUED_TO_PROSE, (match, span: string, letter: string) =>
			isRepairableInlineCodeSpan(span) ? `${span} ${letter}` : match,
		)
		.replace(PROSE_GLUED_TO_MDX_SLUG, "$1 $2")
		.replace(ADJACENT_LINKS_NO_SPACE, "], [");
}

/**
 * Trims spurious leading or trailing spaces inside inline code spans.
 *
 * @param content Markdown body or snippet
 *
 * @returns Content with normalized inline code interiors
 */
export function normalizeInlineCodeInteriorSpacing(content: string) {
	return content.replace(INLINE_CODE_SPAN, (span) => {
		const inner = span.slice(1, -1).trim();

		if (inner.length === 0) {
			return span;
		}

		return `\`${inner}\``;
	});
}

/**
 * Trims spurious whitespace inside markdown link labels.
 *
 * @param content Markdown body or snippet
 *
 * @returns Content with `[ label ]` normalized to `[label]`
 */
export function normalizeMarkdownLinkLabelSpacing(content: string) {
	return content.replace(MARKDOWN_LINK_WITH_SPACED_LABEL, (match, label: string, url: string) => {
		const trimmedLabel = label.trim();

		if (trimmedLabel === label) {
			return match;
		}

		return `[${trimmedLabel}](${url})`;
	});
}

/**
 * Collapses duplicated whitespace after markdown heading markers.
 *
 * @param content Markdown body or snippet
 *
 * @returns Content with `##  Title` normalized to `## Title`
 */
export function normalizeHeadingMarkerSpacing(content: string) {
	return content.replace(HEADING_MARKER_EXTRA_SPACING, "$1 ");
}

/**
 * Rewrites MDN docs URLs to the target locale slug.
 *
 * @param content Assembled translated markdown
 * @param targetMdnLocaleSlug MDN path locale segment (for example `ru` or `pt-BR`)
 *
 * @returns Document with MDN locale segments aligned to the target slug
 */
export function rewriteMdnLinksToLocale(content: string, targetMdnLocaleSlug: string) {
	const targetPrefix = `https://developer.mozilla.org/${targetMdnLocaleSlug}`;

	return content.replace(MDN_DOCS_URL_LOCALE, (match) =>
		match === targetPrefix ? match : targetPrefix,
	);
}

/**
 * Removes guillemet echoes of `'use client'` / `'use server'` after the inline code span.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content without `«use client»` / `«use server»` echoes after directive code spans
 */
export function stripEchoedUseDirectiveGuillemets(content: string) {
	return content.replace(ECHOED_USE_DIRECTIVE_GUILLEMETS, "$1");
}

/**
 * Collapses duplicated English lead-in phrases before a comma after `'use client'`.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with duplicated `With` lead-ins removed
 */
export function collapseDuplicatedEnUseClientLeadIn(content: string) {
	return content.replace(DUPLICATED_ENGLISH_USE_CLIENT_LEAD_IN, "$1,");
}

/**
 * Repairs shared directive echo regressions introduced during translation.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with echoed directive guillemets and English lead-in duplicates repaired
 */
export function repairSharedDirectiveEchoArtifacts(content: string) {
	let cleaned = stripEchoedUseDirectiveGuillemets(content);
	cleaned = collapseDuplicatedEnUseClientLeadIn(cleaned);

	return cleaned;
}

/** Optional locale-scoped mechanical repair pass */
export type LocaleMechanicalRepairPass = (content: string) => string;

/** Options for deterministic post-translation mechanical repairs */
export interface MechanicalTranslationRepairOptions {
	/** MDN path locale segment; skips MDN rewrite when omitted */
	mdnLocaleSlug?: string;

	/** Locale-specific repair hook registered for the active target language */
	localeRepairs?: LocaleMechanicalRepairPass;
}

/**
 * Applies deterministic mechanical repairs before post-translation validation.
 *
 * @param content Assembled translated markdown document
 * @param options Locale-specific repair options
 *
 * @returns Document with spacing and MDN link regressions repaired
 */
export function applyMechanicalTranslationRepairs(
	content: string,
	options: MechanicalTranslationRepairOptions = {},
) {
	let cleaned = repairSharedDirectiveEchoArtifacts(content);

	if (options.localeRepairs) {
		cleaned = options.localeRepairs(cleaned);
	}

	cleaned = normalizeMarkdownLinkLabelSpacing(cleaned);
	cleaned = normalizeMarkdownLinkBeforePunctuationSpacing(cleaned);
	cleaned = repairMdxSpacing(cleaned);
	cleaned = normalizeHeadingMarkerSpacing(cleaned);
	cleaned = normalizeInlineCodeInteriorSpacing(cleaned);
	cleaned = normalizeInlineCodeBeforePunctuationSpacing(cleaned);

	if (options.mdnLocaleSlug) {
		cleaned = rewriteMdnLinksToLocale(cleaned, options.mdnLocaleSlug);
	}

	return cleaned;
}

/**
 * Aligns trailing newline with the reference document.
 *
 * @param content Translated content
 * @param referenceContent Original document used for EOF newline detection
 *
 * @returns Content with trailing newline preserved or removed to match the reference
 */
export function alignTrailingNewline(content: string, referenceContent: string) {
	const referenceHasTrailingNewline = referenceContent.endsWith("\n");

	if (!referenceHasTrailingNewline) {
		return content.endsWith("\n") ? content.slice(0, -1) : content;
	}

	return content.endsWith("\n") ? content : `${content}\n`;
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
	cleaned = alignTrailingNewline(cleaned, file.content);

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
