/** Matches an opening GFM backtick fence line (start or after newline, up to three spaces indent). */
const FENCE_OPEN_LINE = /(^|\r?\n)([ \t]{0,3})(`{3,})([^\n\r]*)\r?\n/g;

/** Returns a RegExp for a closing fence line with at least `tickLength` backticks (CommonMark rule). */
function closingFenceLinePattern(tickLength: number) {
	return new RegExp(`^[ \\t]{0,3}\`{${tickLength},}\\s*$`);
}

/**
 * Finds the exclusive end index after a valid closing fence line, or `null` if none before EOF.
 *
 * @param markdown Full markdown source
 * @param bodyStart Index after the opening fence line
 * @param tickLength Opening fence backtick run length
 *
 * @returns Index after newline following the closing line, or `null` when unclosed
 */
function findClosingFenceExclusiveEnd(markdown: string, bodyStart: number, tickLength: number) {
	const closingPattern = closingFenceLinePattern(tickLength);
	let position = bodyStart;

	while (position <= markdown.length) {
		const lineEnd = markdown.indexOf("\n", position);
		const endExclusive = lineEnd === -1 ? markdown.length : lineEnd;
		const line = markdown.slice(position, endExclusive);

		if (closingPattern.test(line)) {
			return lineEnd === -1 ? markdown.length : lineEnd + 1;
		}

		if (lineEnd === -1) {
			return null;
		}

		position = lineEnd + 1;
	}

	return null;
}

/**
 * Locates the next well-formed backtick fenced block at or after `searchFrom`.
 *
 * @param markdown Full markdown source
 * @param searchFrom Character index to start scanning
 *
 * @returns Inclusive `start` and exclusive `end` for the full fence, or `null`
 */
function findNextFencedCodeBlockBounds(markdown: string, searchFrom: number) {
	const opener = new RegExp(FENCE_OPEN_LINE.source, "g");
	opener.lastIndex = searchFrom;

	let match: RegExpExecArray | null;

	while ((match = opener.exec(markdown)) !== null) {
		const linePrefix = match[1] ?? "";
		const lineStart = match.index + linePrefix.length;
		const ticks = match[3];
		if (!ticks) {
			opener.lastIndex = match.index + 1;
			continue;
		}

		const tickLength = ticks.length;
		const bodyStart = match.index + match[0].length;
		const closingEnd = findClosingFenceExclusiveEnd(markdown, bodyStart, tickLength);

		if (closingEnd === null) {
			opener.lastIndex = lineStart + 1;
			continue;
		}

		return { end: closingEnd, start: lineStart };
	}

	return null;
}

/** One fenced region removed for verbatim LLM handling and later restore */
export interface MarkdownVerbatimFenceReplacement {
	/** Placeholder id embedded in `<!-- translate-react:${id} -->` */
	readonly id: string;

	/** Full original fence including opening and closing lines */
	readonly originalFence: string;
}

/** Output of {@link maskLargeVerbatimFencedCodeBlocks} */
export interface MarkdownVerbatimMaskResult {
	/** Markdown with some fences replaced by placeholders */
	readonly maskedMarkdown: string;

	/** Ordered list for {@link restoreMaskedVerbatimFences} */
	readonly replacements: readonly MarkdownVerbatimFenceReplacement[];
}

/**
 * Replaces fenced blocks at or above `minTokens` with HTML comment placeholders for cheaper LLM input; use {@link restoreMaskedVerbatimFences} after translation.
 *
 * Callers supply the same token estimator as chunking (e.g. `ChunksManager.estimateTokenCount`). Text inside a masked fence is not sent to the model.
 *
 * @param markdown Source markdown
 * @param options `estimateTokens` and `minTokens` cutoff
 *
 * @returns Masked markdown and replacement list for restore
 *
 * @example
 * ```typescript
 * const chunks = new ChunksManager("gpt-4o");
 * const { maskedMarkdown, replacements } = maskLargeVerbatimFencedCodeBlocks("# T\n\n```js\nx\n```\n", {
 *   estimateTokens: (s) => chunks.estimateTokenCount(s),
 *   minTokens: 500,
 * });
 * ```
 */
export function maskLargeVerbatimFencedCodeBlocks(
	markdown: string,
	options: {
		readonly estimateTokens: (content: string) => number;
		readonly minTokens: number;
	},
) {
	const replacements: MarkdownVerbatimFenceReplacement[] = [];
	let cursor = 0;
	let output = "";
	let replacementCounter = 0;

	while (cursor < markdown.length) {
		const bounds = findNextFencedCodeBlockBounds(markdown, cursor);

		if (!bounds) {
			output += markdown.slice(cursor);
			break;
		}

		output += markdown.slice(cursor, bounds.start);
		const originalFence = markdown.slice(bounds.start, bounds.end);
		const tokenCount = options.estimateTokens(originalFence);

		if (tokenCount >= options.minTokens) {
			const id = `verbatim-fence-${replacementCounter++}`;
			output += `<!-- translate-react:${id} -->`;
			replacements.push({ id, originalFence });
		} else {
			output += originalFence;
		}

		cursor = bounds.end;
	}

	return { maskedMarkdown: output, replacements } satisfies MarkdownVerbatimMaskResult;
}

/**
 * Restores original fenced blocks by replacing each `<!-- translate-react:… -->` marker from `replacements`.
 *
 * @param translatedMasked Translated markdown that still contains markers
 * @param replacements Same array returned with the masked input
 *
 * @returns Markdown with original fences reinserted
 *
 * @example
 * ```typescript
 * const finalMd = restoreMaskedVerbatimFences(translated, replacements);
 * ```
 */
export function restoreMaskedVerbatimFences(
	translatedMasked: string,
	replacements: readonly MarkdownVerbatimFenceReplacement[],
) {
	let result = translatedMasked;

	for (const { id, originalFence } of replacements) {
		const marker = `<!-- translate-react:${id} -->`;
		result = result.split(marker).join(originalFence);
	}

	return result;
}
