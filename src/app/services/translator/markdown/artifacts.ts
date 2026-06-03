import type { Logger } from "pino";

import { MARKDOWN_REGEXES } from "./markdown.regexes";

/**
 * Opening line of a markdown fenced code block at the very start of a slice (after optional BOM,
 * blank lines, and horizontal whitespace).
 */
const LEADING_FENCE_LINE = new RegExp(
	"^(?:\\uFEFF)?(?:[\\t \\f\\v]*\\r?\\n)*[\\t ]*(```+|~~~+)([^\\n]*)\\r?\\n",
);

/**
 * Closing fence line anchored at the end of the slice (optional CRLF before the fence).
 */
const TRAILING_FENCE_LINE = new RegExp("(\\r?\\n)[\\t ]*(```+|~~~+)\\s*$");

/**
 * Counts consecutive newline characters from the start of `s` (treats `\r\n` as one logical break).
 *
 * @param s String whose leading newline run is measured (optional UTF-8 BOM is skipped before counting)
 *
 * @returns Number of leading newline characters
 */
export function leadingNewlineRunLength(s: string): number {
	let index = 0;
	if (s.startsWith("\uFEFF")) {
		index += 1;
	}

	let count = 0;
	while (index < s.length) {
		if (s[index] === "\r" && s[index + 1] === "\n") {
			count += 1;
			index += 2;
		} else if (s[index] === "\n") {
			count += 1;
			index += 1;
		} else {
			break;
		}
	}

	return count;
}

/**
 * Removes the first line when it is only an opening markdown fence (backtick or tilde fences with optional info string).
 *
 * @param slice Markdown fragment to trim
 *
 * @returns Remaining text after the opening fence line, or `null` when no leading fence is present
 */
function stripLeadingFenceLineOnce(slice: string): string | null {
	const match = LEADING_FENCE_LINE.exec(slice);
	if (match?.index !== 0) {
		return null;
	}

	return slice.slice(match[0].length);
}

/**
 * Removes a trailing closing fence line when it is only a fence token (backtick or tilde fences).
 *
 * @param slice Markdown fragment to trim
 *
 * @returns Text before the closing fence line, or `null` when no trailing fence is present
 */
function stripTrailingFenceLineOnce(slice: string): string | null {
	const match = TRAILING_FENCE_LINE.exec(slice);
	if (!match || match.index + match[0].length !== slice.length) {
		return null;
	}

	return slice.slice(0, match.index);
}

/**
 * When the model replaced leading blank lines with a spurious fence, restores at least as many
 * leading newlines as the source had so the first MDX/markdown line matches the original layout.
 *
 * @param sourceMarkdown Original markdown whose leading newline prefix is the reference
 * @param translatedMarkdown Model output that may have lost leading blank lines
 *
 * @returns `translatedMarkdown` padded with leading newlines to match the source prefix
 */
function padTranslatedLeadingNewlinesToSourcePrefix(
	sourceMarkdown: string,
	translatedMarkdown: string,
): string {
	const sourceNewlines = leadingNewlineRunLength(sourceMarkdown);
	const translatedNewlines = leadingNewlineRunLength(translatedMarkdown);
	if (sourceNewlines <= translatedNewlines) {
		return translatedMarkdown;
	}

	return "\n".repeat(sourceNewlines - translatedNewlines) + translatedMarkdown;
}

/**
 * Strips spurious outer ` ```…``` ` / `~~~…~~~ ` wrappers from a translated slice when the **source**
 * slice contained no fenced code blocks, then restores leading newline depth if the fence ate blank lines.
 *
 * @param sourceMarkdown Original markdown slice (same span the model was asked to translate)
 * @param translatedMarkdown Model output for that slice
 * @param logger Optional logger for observability when stripping occurs
 *
 * @returns Sanitized translation; unchanged when the source already had fenced blocks or no peelable fences
 */
export function stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(
	sourceMarkdown: string,
	translatedMarkdown: string,
	logger?: Logger,
): string {
	if ((sourceMarkdown.match(MARKDOWN_REGEXES.codeBlock) ?? []).length > 0) {
		return translatedMarkdown;
	}

	let result = translatedMarkdown;
	let strippedAny = false;

	for (let round = 0; round < 4; round++) {
		const before = result;
		const afterLead = stripLeadingFenceLineOnce(result);
		if (afterLead !== null) {
			result = afterLead;
			strippedAny = true;
		}

		const afterTrail = stripTrailingFenceLineOnce(result);
		if (afterTrail !== null) {
			result = afterTrail;
			strippedAny = true;
		}

		if (result === before) {
			break;
		}
	}

	if (strippedAny) {
		result = padTranslatedLeadingNewlinesToSourcePrefix(sourceMarkdown, result);
		logger?.info(
			{ strippedSpuriousOuterMarkdownFence: true },
			"Stripped spurious outer markdown code fence(s) from translation (source had no fenced blocks)",
		);
	}

	return result;
}
