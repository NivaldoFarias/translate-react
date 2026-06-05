import { MARKDOWN_REGEXES } from "@/app/services/translator/markdown/markdown.regexes";

/** Parsed markdown link with document span */
export interface MarkdownLinkSpan {
	/** Link label text inside brackets */
	readonly text: string;

	/** Destination URL inside parentheses */
	readonly url: string;

	/** Start index of the full `[text](url)` match */
	readonly start: number;

	/** End index (exclusive) of the full match */
	readonly end: number;
}

/** A markdown link integrity problem between source and translation */
export interface MarkdownLinkViolation {
	/** Short description for logs and guard messages */
	readonly message: string;

	/** Affected URL when known */
	readonly url?: string;
}

/**
 * Lists `[text](url)` spans in document order.
 *
 * @param markdown Markdown body to scan
 *
 * @returns Link spans with positions
 */
export function extractMarkdownLinkSpans(markdown: string) {
	const pattern = new RegExp(MARKDOWN_REGEXES.markdownLink.source, "g");
	const spans: MarkdownLinkSpan[] = [];

	for (const match of markdown.matchAll(pattern)) {
		const url = match.groups?.["url"];
		if (!url) continue;

		spans.push({
			text: match.groups?.["text"] ?? "",
			url,
			start: match.index,
			end: match.index + match[0].length,
		});
	}

	return spans;
}

/**
 * Detects missing or structurally broken markdown links after translation.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Violations when link count or URL wrapping regressed
 */
export function findMarkdownLinkViolations(sourceMarkdown: string, translatedMarkdown: string) {
	const sourceLinks = extractMarkdownLinkSpans(sourceMarkdown);
	if (sourceLinks.length === 0) return [];

	const translatedLinks = extractMarkdownLinkSpans(translatedMarkdown);
	const violations: MarkdownLinkViolation[] = [];

	if (translatedLinks.length < sourceLinks.length) {
		violations.push({
			message: `Markdown link count dropped (${sourceLinks.length} → ${translatedLinks.length})`,
		});
	}

	const sourceCountByUrl = countLinksByUrl(sourceLinks);
	const translatedCountByUrl = countLinksByUrl(translatedLinks);

	for (const [url, sourceCount] of sourceCountByUrl) {
		const translatedCount = translatedCountByUrl.get(url) ?? 0;

		if (translatedCount < sourceCount) {
			violations.push({
				message: `Missing markdown link for URL "${url}" (${sourceCount} → ${translatedCount})`,
				url,
			});
		}
	}

	for (const url of sourceCountByUrl.keys()) {
		if (findOrphanLinkClosings(translatedMarkdown, url).length > 0) {
			violations.push({
				message: `Broken markdown link syntax for URL "${url}"`,
				url,
			});
		}

		if (hasBareUrlOccurrence(translatedMarkdown, url, translatedLinks)) {
			violations.push({
				message: `URL "${url}" appears outside a markdown link`,
				url,
			});
		}
	}

	return dedupeViolations(violations);
}

/**
 * Joins every deduplicated violation message for logs, guard errors, and retry hints.
 *
 * @param violations Detected link problems
 *
 * @returns Semicolon-separated summary of all violations
 */
export function formatMarkdownLinkViolationSummary(violations: readonly MarkdownLinkViolation[]) {
	return violations.map((violation) => violation.message).join("; ");
}

/**
 * Builds a retry hint for markdown link integrity failures.
 *
 * @param violations Detected link problems
 *
 * @returns Hint string for the LLM system prompt
 */
export function buildMarkdownLinkRetryHint(violations: readonly MarkdownLinkViolation[]) {
	const problems = formatMarkdownLinkViolationSummary(violations);
	const problemClause = problems.length > 0 ? ` Problems found: ${problems}.` : "";

	return `Preserve every source markdown link as \`[translated label](same-url)\` with balanced brackets and parentheses. Do not leave bare paths or broken \`[...](url)\` fragments.${problemClause}`;
}

/**
 * Counts links grouped by destination URL.
 *
 * @param links Link spans to aggregate
 *
 * @returns Map of URL to occurrence count
 */
function countLinksByUrl(links: readonly MarkdownLinkSpan[]) {
	const counts = new Map<string, number>();

	for (const { url } of links) {
		counts.set(url, (counts.get(url) ?? 0) + 1);
	}

	return counts;
}

/**
 * Finds `](url)` closings that are not part of a valid `[text](url)` span.
 *
 * @param markdown Translated markdown
 * @param url URL from the source document
 *
 * @returns Indices of orphan link closings
 */
function findOrphanLinkClosings(markdown: string, url: string) {
	const closingPattern = new RegExp(`\\]\\(${escapeRegExp(url)}(?:\\s+"[^"]*")?\\)`, "g");
	const orphanIndices: number[] = [];

	for (const match of markdown.matchAll(closingPattern)) {
		const closingIndex = match.index;

		const openIndex = markdown.lastIndexOf("[", closingIndex);
		if (openIndex < 0) {
			orphanIndices.push(closingIndex);
			continue;
		}

		const segment = markdown.slice(openIndex);
		const validPattern = new RegExp(
			`^\\[(?:[^\\]\\\\]|\\\\.)*\\]\\(${escapeRegExp(url)}(?:\\s+"[^"]*")?\\)`,
		);

		if (!validPattern.test(segment)) {
			orphanIndices.push(closingIndex);
		}
	}

	return orphanIndices;
}

/**
 * Reports whether a source URL appears in prose outside any parsed link span.
 *
 * @param markdown Translated markdown
 * @param url URL from the source document
 * @param linkSpans Parsed link spans in the translation
 *
 * @returns `true` when a bare URL occurrence exists
 */
function hasBareUrlOccurrence(
	markdown: string,
	url: string,
	linkSpans: readonly MarkdownLinkSpan[],
) {
	let searchFrom = 0;

	while (searchFrom < markdown.length) {
		const index = markdown.indexOf(url, searchFrom);
		if (index < 0) return false;

		const insideLink = linkSpans.some(({ start, end }) => index >= start && index < end);

		if (!insideLink) return true;

		searchFrom = index + url.length;
	}

	return false;
}

/**
 * Removes duplicate violations that share the same message.
 *
 * @param violations Raw violation list
 *
 * @returns Deduplicated violations
 */
function dedupeViolations(violations: readonly MarkdownLinkViolation[]) {
	const seen = new Set<string>();
	const unique: MarkdownLinkViolation[] = [];

	for (const violation of violations) {
		if (seen.has(violation.message)) continue;

		seen.add(violation.message);
		unique.push(violation);
	}

	return unique;
}

/**
 * Escapes special characters in a string for safe use inside a `RegExp`.
 *
 * @param value Raw substring to embed in a regex pattern
 *
 * @returns Literal-safe string for `RegExp` construction
 */
function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
