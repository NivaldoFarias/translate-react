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

	/** 1-based start line where the problem appears */
	readonly startLine: number;

	/** 1-based end line where the problem appears */
	readonly endLine: number;
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
 * Returns the 1-based line number at a UTF-16 offset in markdown.
 *
 * @param markdown Full markdown document
 * @param offset Character offset from the start of the document
 *
 * @returns 1-based line number
 */
function lineNumberAtOffset(markdown: string, offset: number) {
	if (offset <= 0) {
		return 1;
	}

	return markdown.slice(0, offset).split("\n").length;
}

/**
 * Builds a line range for a span inside markdown.
 *
 * @param markdown Full markdown document
 * @param start Start offset of the span
 * @param end End offset of the span (exclusive)
 *
 * @returns 1-based line range covering the span
 */
function lineRangeForSpan(markdown: string, start: number, end: number) {
	return {
		startLine: lineNumberAtOffset(markdown, start),
		endLine: lineNumberAtOffset(markdown, Math.max(start, end - 1)),
	};
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
		const firstMissing = findFirstUnderrepresentedSourceLink(sourceLinks, translatedLinks);
		const location =
			firstMissing ?
				lineRangeForSpan(sourceMarkdown, firstMissing.start, firstMissing.end)
			:	{ startLine: 1, endLine: 1 };

		violations.push({
			message: `Markdown link count dropped (${sourceLinks.length} → ${translatedLinks.length})`,
			...location,
		});
	}

	const sourceCountByUrl = countLinksByUrl(sourceLinks);
	const translatedCountByUrl = countLinksByUrl(translatedLinks);

	for (const [url, sourceCount] of sourceCountByUrl) {
		const translatedCount = translatedCountByUrl.get(url) ?? 0;

		if (translatedCount < sourceCount) {
			const sourceLink = findSourceLinkForUrl(sourceLinks, url);
			const location =
				sourceLink ?
					lineRangeForSpan(sourceMarkdown, sourceLink.start, sourceLink.end)
				:	findUrlLineRange(translatedMarkdown, url);

			violations.push({
				message: `Missing markdown link for URL "${url}" (${sourceCount} → ${translatedCount})`,
				url,
				...location,
			});
		}
	}

	for (const url of sourceCountByUrl.keys()) {
		const orphanIndices = findOrphanLinkClosings(translatedMarkdown, url);
		if (orphanIndices.length > 0) {
			const orphanIndex = orphanIndices[0] ?? 0;
			const closingLength = `](${url})`.length;

			violations.push({
				message: `Broken markdown link syntax for URL "${url}"`,
				url,
				...lineRangeForSpan(translatedMarkdown, orphanIndex, orphanIndex + closingLength),
			});
		}

		const bareUrlOffset = findBareUrlOffset(translatedMarkdown, url, translatedLinks);
		if (bareUrlOffset !== null) {
			violations.push({
				message: `URL "${url}" appears outside a markdown link`,
				url,
				...lineRangeForSpan(translatedMarkdown, bareUrlOffset, bareUrlOffset + url.length),
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
 * Finds the first source link that is missing from the translated link spans.
 *
 * @param sourceLinks Parsed source links
 * @param translatedLinks Parsed translated links
 *
 * @returns First underrepresented source link span, if any
 */
function findFirstUnderrepresentedSourceLink(
	sourceLinks: readonly MarkdownLinkSpan[],
	translatedLinks: readonly MarkdownLinkSpan[],
) {
	const translatedCountByUrl = countLinksByUrl(translatedLinks);

	for (const link of sourceLinks) {
		const translatedCount = translatedCountByUrl.get(link.url) ?? 0;
		if (translatedCount === 0) {
			return link;
		}

		translatedCountByUrl.set(link.url, translatedCount - 1);
	}

	return sourceLinks[0] ?? null;
}

/**
 * Returns the first source link span for a URL.
 *
 * @param sourceLinks Parsed source links
 * @param url Destination URL to locate
 *
 * @returns Matching source link span, if any
 */
function findSourceLinkForUrl(sourceLinks: readonly MarkdownLinkSpan[], url: string) {
	return sourceLinks.find((link) => link.url === url) ?? null;
}

/**
 * Locates the first line range for a URL substring in markdown.
 *
 * @param markdown Document to search
 * @param url URL substring
 *
 * @returns Line range for the first match, or line 1 when absent
 */
function findUrlLineRange(markdown: string, url: string) {
	const offset = markdown.indexOf(url);
	if (offset < 0) {
		return { startLine: 1, endLine: 1 };
	}

	return lineRangeForSpan(markdown, offset, offset + url.length);
}

/**
 * Finds the first bare URL occurrence outside parsed link spans.
 *
 * @param markdown Translated markdown
 * @param url URL from the source document
 * @param linkSpans Parsed link spans in the translation
 *
 * @returns Start offset of the first bare occurrence, or `null`
 */
function findBareUrlOffset(markdown: string, url: string, linkSpans: readonly MarkdownLinkSpan[]) {
	let searchFrom = 0;

	while (searchFrom < markdown.length) {
		const index = markdown.indexOf(url, searchFrom);
		if (index < 0) {
			return null;
		}

		const insideLink = linkSpans.some(({ start, end }) => index >= start && index < end);

		if (!insideLink) {
			return index;
		}

		searchFrom = index + url.length;
	}

	return null;
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
