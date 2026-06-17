import { MARKDOWN_REGEXES } from "../../markdown/markdown.regexes";

/** Detects duplicated markdown heading marker prefixes such as `## ## Title` */
const HEADING_SYNTAX_REGEXES = {
	doubleMarker: /(?:^|\n)(#{1,6}\s+){2,}/m,
} as const;

/**
 * Counts markdown heading lines (`#` through `######`) in a document.
 *
 * @param markdown Document text
 *
 * @returns Number of heading lines
 */
export function countMarkdownHeadings(markdown: string) {
	return (markdown.match(MARKDOWN_REGEXES.headings) ?? []).length;
}

/**
 * Collects unique MDX slug comment expressions from markdown.
 *
 * @param markdown Document text to scan
 *
 * @returns De-duplicated slug expressions in first-seen order
 */
export function extractMdxSlugComments(markdown: string) {
	const matches = markdown.match(MARKDOWN_REGEXES.mdxSlugComment) ?? [];
	return [...new Set(matches)];
}

/**
 * Finds MDX slug comments present in the source but missing from the translation.
 *
 * @param source Original markdown
 * @param translated Translated markdown
 *
 * @returns Missing slug expressions
 */
export function findMissingMdxSlugComments(source: string, translated: string) {
	const sourceSlugs = extractMdxSlugComments(source);
	return sourceSlugs.filter((slug) => !translated.includes(slug));
}

/**
 * Finds lines where markdown heading markers were duplicated during translation.
 *
 * @param translated Translated markdown
 *
 * @returns Offending line excerpts (up to five samples)
 */
export function findDuplicatedHeadingMarkerLines(translated: string) {
	const lines = translated.split("\n");
	const violations: string[] = [];

	for (const line of lines) {
		if (HEADING_SYNTAX_REGEXES.doubleMarker.test(line)) {
			violations.push(line.trim());
		}

		if (violations.length >= 5) {
			break;
		}
	}

	return violations;
}
