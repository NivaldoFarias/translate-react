import type { ReviewerValidationNotice } from "@/app/services/github/types";
import type { FenceJsxStaticTextMismatch } from "@/app/services/translator/validation/analyzers/fence-jsx-static-text.analyzer";

import type { LocalePRBodyStrings } from "./types";

import { MARKDOWN_REGEXES } from "@/app/services/translator/markdown/markdown.regexes";
import {
	extractFencedCodeBlockBodies,
	findFenceFunctionIdentifierMismatches,
} from "@/app/services/translator/validation/analyzers/fence-code-identifier.analyzer";
import { findFenceJsxStaticTextMismatches } from "@/app/services/translator/validation/analyzers/fence-jsx-static-text.analyzer";
import { findMarkdownLinkViolations } from "@/app/services/translator/validation/analyzers/markdown-link.analyzer";

const HINT_VIOLATION_SPLIT = /\.\s+(?:fence \d+|Problems found:)/;

/**
 * Builds a line-range label for the PR details section.
 *
 * @param strings Locale strings for reviewer warnings
 * @param startLine 1-based start line in the source markdown
 * @param endLine 1-based end line in the source markdown
 *
 * @returns Localized location label
 */
function formatViolationLocation(
	strings: LocalePRBodyStrings["reviewerWarnings"],
	startLine: number,
	endLine: number,
) {
	return strings.violationLocation(startLine, endLine);
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
 * Returns the character offset where a fenced code block body starts.
 *
 * @param markdown Full markdown document
 * @param fenceIndex 1-based fence index
 *
 * @returns Body start offset, or `null` when the fence is missing
 */
function findFenceBodyStartOffset(markdown: string, fenceIndex: number) {
	let currentFence = 0;

	for (const match of markdown.matchAll(MARKDOWN_REGEXES.codeBlock)) {
		currentFence += 1;
		if (currentFence !== fenceIndex) {
			continue;
		}

		const body = match[1] ?? "";
		const bodyStartInMatch = match[0].indexOf(body);
		if (bodyStartInMatch < 0) {
			return null;
		}

		return match.index + bodyStartInMatch;
	}

	return null;
}

/**
 * Locates `needle` inside a fenced code block and returns its document offset.
 *
 * @param markdown Full markdown document
 * @param fenceIndex 1-based fence index
 * @param needle Text to find inside the fence body
 *
 * @returns Start offset of `needle` in `markdown`, or `null` when not found
 */
function findNeedleOffsetInFence(markdown: string, fenceIndex: number, needle: string) {
	const fenceBodies = extractFencedCodeBlockBodies(markdown);
	const body = fenceBodies[fenceIndex - 1];
	const bodyStart = findFenceBodyStartOffset(markdown, fenceIndex);

	if (!body || bodyStart === null) {
		return null;
	}

	const indexInBody = body.indexOf(needle);
	if (indexInBody < 0) {
		return null;
	}

	return bodyStart + indexInBody;
}

/**
 * Formats a before/after snippet as a Markdown diff fence for maintainer review.
 *
 * @param before Source text
 * @param after Translated text (empty when missing)
 *
 * @returns Fenced `diff` block
 */
function formatDiffBlock(before: string, after: string) {
	const minusLines = before.split("\n").map((line) => `- ${line}`);
	const plusLines = after.split("\n").map((line) => `+ ${line}`);

	return ["```diff", ...minusLines, ...plusLines, "```"].join("\n");
}

/**
 * Extracts the instructional sentence from a guard retry hint before violation clauses.
 *
 * @param hint Full retry hint string
 *
 * @returns Instruction-only prose
 */
function extractHintInstruction(hint: string) {
	const splitMatch = HINT_VIOLATION_SPLIT.exec(hint);
	if (splitMatch?.index === undefined) {
		return hint.trim();
	}

	return hint.slice(0, splitMatch.index + 1).trim();
}

/**
 * Formats one JSX static-text mismatch as a numbered subsection with a diff block.
 *
 * @param strings Locale strings for reviewer warnings
 * @param sourceMarkdown Original markdown
 * @param mismatch Detected JSX static text mismatch
 * @param index 1-based violation index within the guard section
 *
 * @returns Markdown subsection for the PR details block
 */
function formatFenceJsxMismatchItem(
	strings: LocalePRBodyStrings["reviewerWarnings"],
	sourceMarkdown: string,
	mismatch: FenceJsxStaticTextMismatch,
	index: number,
) {
	const needleOffset = findNeedleOffsetInFence(
		sourceMarkdown,
		mismatch.fenceIndex,
		mismatch.sourceText,
	);

	const startLine = needleOffset === null ? 1 : lineNumberAtOffset(sourceMarkdown, needleOffset);
	const endLine =
		needleOffset === null ? startLine : (
			lineNumberAtOffset(sourceMarkdown, needleOffset + mismatch.sourceText.length)
		);

	const location = formatViolationLocation(strings, startLine, endLine);
	const translated = mismatch.translatedText ?? "";

	return `###### ${index}. ${location}

${formatDiffBlock(mismatch.sourceText, translated)}`;
}

/**
 * Formats JSX static-text guard violations with diff blocks when source text is available.
 *
 * @param strings Locale strings for reviewer warnings
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 * @param hint Retry hint fallback when structured mismatches are empty
 *
 * @returns Guard subsection body or empty string
 */
function formatFenceJsxStaticTextSection(
	strings: LocalePRBodyStrings["reviewerWarnings"],
	sourceMarkdown: string,
	translatedMarkdown: string,
	hint: string,
) {
	const mismatches = findFenceJsxStaticTextMismatches(sourceMarkdown, translatedMarkdown);
	const instruction = extractHintInstruction(hint);

	if (mismatches.length === 0) {
		return `${instruction}\n\n##### \`fenceJsxStaticText\`\n\n${hint}`;
	}

	const items = mismatches
		.map((mismatch, index) =>
			formatFenceJsxMismatchItem(strings, sourceMarkdown, mismatch, index + 1),
		)
		.join("\n\n");

	return `${instruction}

##### \`fenceJsxStaticText\`

${items}`;
}

/**
 * Formats fence function-identifier guard violations for the PR details block.
 *
 * @param strings Locale strings for reviewer warnings
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 * @param hint Retry hint fallback
 *
 * @returns Guard subsection body
 */
function formatFenceFunctionIdentifiersSection(
	strings: LocalePRBodyStrings["reviewerWarnings"],
	sourceMarkdown: string,
	translatedMarkdown: string,
	hint: string,
) {
	const mismatches = findFenceFunctionIdentifierMismatches(sourceMarkdown, translatedMarkdown);
	const instruction = extractHintInstruction(hint);

	if (mismatches.length === 0) {
		return `${instruction}\n\n##### \`fenceFunctionIdentifiers\`\n\n${hint}`;
	}

	const items = mismatches
		.map((mismatch, index) => {
			const needleOffset = findNeedleOffsetInFence(
				sourceMarkdown,
				mismatch.fenceIndex,
				`function ${mismatch.sourceName}`,
			);
			const startLine =
				needleOffset === null ? 1 : lineNumberAtOffset(sourceMarkdown, needleOffset);
			const location = formatViolationLocation(strings, startLine, startLine);

			return `###### ${index + 1}. ${location}

Keep \`${mismatch.sourceName}\` exactly as in the source.`;
		})
		.join("\n\n");

	return `${instruction}

##### \`fenceFunctionIdentifiers\`

${items}`;
}

/**
 * Formats markdown link guard violations for the PR details block.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 * @param hint Retry hint fallback
 *
 * @returns Guard subsection body
 */
function formatMarkdownLinksSection(
	sourceMarkdown: string,
	translatedMarkdown: string,
	hint: string,
) {
	const violations = findMarkdownLinkViolations(sourceMarkdown, translatedMarkdown);
	const instruction = extractHintInstruction(hint);

	if (violations.length === 0) {
		return `${instruction}\n\n##### \`markdownLinksPreserved\`\n\n${hint}`;
	}

	const items = violations
		.map((violation, index) => `###### ${index + 1}. ${violation.message}`)
		.join("\n\n");

	return `${instruction}

##### \`markdownLinksPreserved\`

${items}`;
}

/**
 * Formats a guard section from the retry hint when structured source data is unavailable.
 *
 * @param guardId Post-translation guard identifier
 * @param hint Retry hint text
 *
 * @returns Guard subsection body
 */
function formatHintOnlySection(guardId: string, hint: string) {
	const instruction = extractHintInstruction(hint);

	return `${instruction}

##### \`${guardId}\`

${hint}`;
}

/**
 * Builds one guard subsection inside the PR validation details block.
 *
 * @param guardId Post-translation guard identifier
 * @param hints Retry hints collected for the guard
 * @param sourceMarkdown Original markdown when available
 * @param translatedMarkdown Translated markdown when available
 * @param strings Locale strings for reviewer warnings
 *
 * @returns Markdown subsection starting with `###`
 */
function formatGuardSection(
	guardId: string,
	hints: readonly string[],
	sourceMarkdown: string | null,
	translatedMarkdown: string | null,
	strings: LocalePRBodyStrings["reviewerWarnings"],
) {
	const heading = strings.guardLabel(guardId);
	const hint = hints.join(" ");

	const body =
		sourceMarkdown && translatedMarkdown ?
			formatGuardSectionBody(guardId, sourceMarkdown, translatedMarkdown, hint, strings)
		:	formatHintOnlySection(guardId, hint);

	return `### ${heading}

${body}`;
}

/**
 * Dispatches structured formatting for a single guard id.
 *
 * @param guardId Post-translation guard identifier
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 * @param hint Retry hint text
 * @param strings Locale strings for reviewer warnings
 *
 * @returns Guard subsection body without the `###` heading
 */
function formatGuardSectionBody(
	guardId: string,
	sourceMarkdown: string,
	translatedMarkdown: string,
	hint: string,
	strings: LocalePRBodyStrings["reviewerWarnings"],
) {
	switch (guardId) {
		case "fenceJsxStaticText":
			return formatFenceJsxStaticTextSection(strings, sourceMarkdown, translatedMarkdown, hint);
		case "fenceFunctionIdentifiers":
			return formatFenceFunctionIdentifiersSection(
				strings,
				sourceMarkdown,
				translatedMarkdown,
				hint,
			);
		case "markdownLinksPreserved":
			return formatMarkdownLinksSection(sourceMarkdown, translatedMarkdown, hint);
		default:
			return formatHintOnlySection(guardId, hint);
	}
}

/**
 * Builds the collapsible advisory validation section for a translation pull request.
 *
 * @param reviewerNotices Advisory guard hints from post-translation validation
 * @param strings Locale-specific strings for the warnings section
 * @param sourceMarkdown Original file content when available
 * @param translatedMarkdown Translated file content when available
 *
 * @returns Markdown intro and `<details>` block, or empty string when there are no notices
 */
export function buildReviewerWarningsMarkdown(
	reviewerNotices: readonly ReviewerValidationNotice[],
	strings: LocalePRBodyStrings["reviewerWarnings"],
	sourceMarkdown: string | null,
	translatedMarkdown: string | null,
) {
	if (reviewerNotices.length === 0) {
		return "";
	}

	const groupedHints = new Map<string, string[]>();

	for (const notice of reviewerNotices) {
		const hints = groupedHints.get(notice.guardId) ?? [];
		hints.push(notice.hint);
		groupedHints.set(notice.guardId, hints);
	}

	const detailSections = [...groupedHints.entries()]
		.map(([guardId, hints]) =>
			formatGuardSection(guardId, hints, sourceMarkdown, translatedMarkdown, strings),
		)
		.join("\n\n");

	return `${strings.intro}

<details>
<summary>${strings.detailsSummary}</summary>

${detailSections}

</details>
`;
}
