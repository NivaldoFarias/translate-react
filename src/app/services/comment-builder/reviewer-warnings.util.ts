import type { LocalePRBodyStrings } from "@/app/locales/types";
import type { ReviewerValidationNotice } from "@/app/services/github/types";
import type { FenceJsxStaticTextMismatch } from "@/app/services/translator/validation/analyzers/fence-jsx-static-text.analyzer";
import type { PostTranslationGuardId } from "@/app/services/translator/validation/validation.constants";

import { MARKDOWN_REGEXES } from "@/app/services/translator/markdown/markdown.regexes";
import {
	findExtraMarkdownLinkViolationDetails,
	findMdxSpacingViolationDetails,
	findSentenceCaseHeadingViolationDetails,
} from "@/app/services/translator/validation/analyzers/advisory-style.analyzer";
import {
	extractFencedCodeBlockBodies,
	findFenceFunctionIdentifierMismatches,
} from "@/app/services/translator/validation/analyzers/fence-code-identifier.analyzer";
import { findFenceJsxStaticTextMismatches } from "@/app/services/translator/validation/analyzers/fence-jsx-static-text.analyzer";
import { findMarkdownLinkViolations } from "@/app/services/translator/validation/analyzers/markdown-link.analyzer";
import { detectFrontmatterPreservedViolation } from "@/app/services/translator/validation/guards/frontmatter-preserved.guard";
import { detectHeadingsPreservedViolation } from "@/app/services/translator/validation/guards/headings-preserved.guard";
import { POST_TRANSLATION_GUARD_IDS } from "@/app/services/translator/validation/validation.constants";

const HINT_VIOLATION_SPLIT = /\.\s+(?:fence \d+|Problems found:)/;

/** One located violation rendered inside a guard subsection */
interface LocatedViolation {
	readonly startLine: number;
	readonly endLine: number;
	readonly body: string;
}

/**
 * Builds a GitHub-style line anchor label (`L42` or `L42-L45`).
 *
 * @param startLine 1-based start line in the translated markdown
 * @param endLine 1-based end line in the translated markdown
 *
 * @returns Line anchor label for a violation subsection heading
 */
function formatViolationLocation(startLine: number, endLine: number) {
	return startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;
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
 * Wraps guard instruction prose in a Markdown blockquote.
 *
 * @param instruction Instruction-only retry hint sentence
 *
 * @returns Blockquoted instruction
 */
function formatInstructionBlockquote(instruction: string) {
	return instruction
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");
}

/**
 * Wraps a violation snippet in a fenced code block when it is not already fenced.
 *
 * @param body Violation body text
 *
 * @returns Fenced `markdown` block or the original fenced block unchanged
 */
function formatViolationBody(body: string) {
	const trimmed = body.trim();
	if (trimmed.startsWith("```")) {
		return trimmed;
	}

	return ["```markdown", trimmed, "```"].join("\n");
}

/**
 * Renders one located violation as a subsection heading plus body.
 *
 * @param violation Located violation payload
 *
 * @returns Markdown subsection without the guard heading
 */
function formatLocatedViolation(violation: LocatedViolation) {
	const location = formatViolationLocation(violation.startLine, violation.endLine);

	return `#### ${location}

${formatViolationBody(violation.body)}`;
}

/**
 * Builds the guard subsection body from located violations.
 *
 * @param instruction Instruction-only retry hint sentence
 * @param violations Located violations for the guard
 *
 * @returns Guard subsection body without the `###` heading
 */
function formatLocatedViolationsSection(
	instruction: string,
	violations: readonly LocatedViolation[],
) {
	const items = violations.map((violation) => formatLocatedViolation(violation)).join("\n\n");

	return `${formatInstructionBlockquote(instruction)}

${items}`;
}

/**
 * Resolves a line range for JSX static text inside a fenced code block.
 *
 * @param markdown Markdown document containing the fence
 * @param mismatch Detected JSX static text mismatch
 *
 * @returns 1-based start and end line numbers
 */
function resolveFenceJsxLineRange(markdown: string, mismatch: FenceJsxStaticTextMismatch) {
	const needleOffset = findNeedleOffsetInFence(markdown, mismatch.fenceIndex, mismatch.sourceText);

	if (needleOffset === null) {
		return { startLine: 1, endLine: 1 };
	}

	return {
		startLine: lineNumberAtOffset(markdown, needleOffset),
		endLine: lineNumberAtOffset(markdown, needleOffset + mismatch.sourceText.length),
	};
}

/**
 * Collects JSX static-text guard violations with document line ranges.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Located violations for the PR details block
 */
function collectFenceJsxStaticTextViolations(sourceMarkdown: string, translatedMarkdown: string) {
	return findFenceJsxStaticTextMismatches(sourceMarkdown, translatedMarkdown).map((mismatch) => {
		const { startLine, endLine } = resolveFenceJsxLineRange(sourceMarkdown, mismatch);

		return {
			startLine,
			endLine,
			body: formatDiffBlock(mismatch.sourceText, mismatch.translatedText ?? ""),
		} satisfies LocatedViolation;
	});
}

/**
 * Collects fence function-identifier guard violations with document line ranges.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Located violations for the PR details block
 */
function collectFenceFunctionIdentifierViolations(
	sourceMarkdown: string,
	translatedMarkdown: string,
) {
	return findFenceFunctionIdentifierMismatches(sourceMarkdown, translatedMarkdown).map(
		(mismatch) => {
			const needleOffset = findNeedleOffsetInFence(
				sourceMarkdown,
				mismatch.fenceIndex,
				`function ${mismatch.sourceName}`,
			);
			const startLine =
				needleOffset === null ? 1 : lineNumberAtOffset(sourceMarkdown, needleOffset);

			return {
				startLine,
				endLine: startLine,
				body: `Keep \`${mismatch.sourceName}\` exactly as in the source.`,
			} satisfies LocatedViolation;
		},
	);
}

/**
 * Collects markdown link guard violations with document line ranges.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Located violations for the PR details block
 */
function collectMarkdownLinkViolations(sourceMarkdown: string, translatedMarkdown: string) {
	return findMarkdownLinkViolations(sourceMarkdown, translatedMarkdown).map((violation) => ({
		startLine: violation.startLine,
		endLine: violation.endLine,
		body: violation.message,
	}));
}

/**
 * Collects MDX spacing guard violations with document line ranges.
 *
 * @param translatedMarkdown Translated markdown
 *
 * @returns Located violations for the PR details block
 */
function collectMdxSpacingViolations(translatedMarkdown: string) {
	return findMdxSpacingViolationDetails(translatedMarkdown).map((violation) => ({
		startLine: violation.startLine,
		endLine: violation.endLine,
		body: `${violation.label}: …${violation.excerpt}…`,
	}));
}

/**
 * Collects sentence-case heading guard violations with document line ranges.
 *
 * @param translatedMarkdown Translated markdown
 *
 * @returns Located violations for the PR details block
 */
function collectSentenceCaseHeadingViolations(translatedMarkdown: string) {
	return findSentenceCaseHeadingViolationDetails(translatedMarkdown).map((violation) => ({
		startLine: violation.lineNumber,
		endLine: violation.lineNumber,
		body: violation.line,
	}));
}

/**
 * Collects extra markdown link guard violations with document line ranges.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Located violations for the PR details block
 */
function collectExtraMarkdownLinkViolations(sourceMarkdown: string, translatedMarkdown: string) {
	return findExtraMarkdownLinkViolationDetails(sourceMarkdown, translatedMarkdown).map(
		(violation) => ({
			startLine: violation.lineNumber,
			endLine: violation.lineNumber,
			body: `Extra URL: \`${violation.url}\``,
		}),
	);
}

/**
 * Collects frontmatter guard violations with document line ranges.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Located violations for the PR details block
 */
function collectFrontmatterViolations(sourceMarkdown: string, translatedMarkdown: string) {
	const violation = detectFrontmatterPreservedViolation(sourceMarkdown, translatedMarkdown);
	if (!violation) {
		return [];
	}

	return [
		{
			startLine: 1,
			endLine: lineNumberAtOffset(
				sourceMarkdown,
				Math.max(0, violation.sourceFrontmatterBlockLength - 1),
			),
			body: "YAML frontmatter block missing from translation.",
		},
	];
}

/**
 * Collects headings-preserved guard violations with document line ranges.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Located violations for the PR details block
 */
function collectHeadingsPreservedViolations(sourceMarkdown: string, translatedMarkdown: string) {
	const violation = detectHeadingsPreservedViolation(sourceMarkdown, translatedMarkdown);
	if (!violation) {
		return [];
	}

	const line = lineNumberAtOffset(sourceMarkdown, violation.firstHeadingOffset);

	return [
		{
			startLine: line,
			endLine: line,
			body: violation.firstHeadingText,
		},
	];
}

/**
 * Formats a guard section from the retry hint when structured source data is unavailable.
 *
 * @param guardId Post-translation guard identifier
 * @param hint Retry hint text
 *
 * @returns Guard subsection body and violation count for the tally
 */
function formatHintOnlySection(guardId: PostTranslationGuardId, hint: string) {
	const instruction = extractHintInstruction(hint);

	return {
		body: formatLocatedViolationsSection(instruction, [{ startLine: 1, endLine: 1, body: hint }]),
		violationCount: 1,
	};
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
	guardId: PostTranslationGuardId,
	hints: readonly string[],
	sourceMarkdown: string | null,
	translatedMarkdown: string | null,
	strings: LocalePRBodyStrings["reviewerWarnings"],
) {
	const heading = strings.guardLabel(guardId);
	const hint = hints.join(" ");

	const { body, violationCount } =
		sourceMarkdown && translatedMarkdown ?
			formatGuardSectionBody(guardId, sourceMarkdown, translatedMarkdown, hint)
		:	formatHintOnlySection(guardId, hint);

	const tally = strings.violationTally(violationCount);

	return `### ${heading} (\`${guardId}\`, ${tally})

${body}`;
}

/**
 * Dispatches structured formatting for a single guard id.
 *
 * @param guardId Post-translation guard identifier
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 * @param hint Retry hint text
 *
 * @returns Guard subsection body without the `###` heading and violation count for the tally
 */
function formatGuardSectionBody(
	guardId: PostTranslationGuardId,
	sourceMarkdown: string,
	translatedMarkdown: string,
	hint: string,
) {
	const instruction = extractHintInstruction(hint);

	const violationsByGuard: Partial<Record<PostTranslationGuardId, () => LocatedViolation[]>> = {
		[POST_TRANSLATION_GUARD_IDS.fenceJsxStaticText]: () =>
			collectFenceJsxStaticTextViolations(sourceMarkdown, translatedMarkdown),
		[POST_TRANSLATION_GUARD_IDS.fenceFunctionIdentifiers]: () =>
			collectFenceFunctionIdentifierViolations(sourceMarkdown, translatedMarkdown),
		[POST_TRANSLATION_GUARD_IDS.markdownLinksPreserved]: () =>
			collectMarkdownLinkViolations(sourceMarkdown, translatedMarkdown),
		[POST_TRANSLATION_GUARD_IDS.mdxSpacing]: () => collectMdxSpacingViolations(translatedMarkdown),
		[POST_TRANSLATION_GUARD_IDS.sentenceCaseHeadings]: () =>
			collectSentenceCaseHeadingViolations(translatedMarkdown),
		[POST_TRANSLATION_GUARD_IDS.extraMarkdownLinks]: () =>
			collectExtraMarkdownLinkViolations(sourceMarkdown, translatedMarkdown),
		[POST_TRANSLATION_GUARD_IDS.frontmatterPreserved]: () =>
			collectFrontmatterViolations(sourceMarkdown, translatedMarkdown),
		[POST_TRANSLATION_GUARD_IDS.headingsPreserved]: () =>
			collectHeadingsPreservedViolations(sourceMarkdown, translatedMarkdown),
	};

	const collectViolations = violationsByGuard[guardId];
	if (!collectViolations) {
		return formatHintOnlySection(guardId, hint);
	}

	const violations = collectViolations();
	if (violations.length === 0) {
		return formatHintOnlySection(guardId, hint);
	}

	return {
		body: formatLocatedViolationsSection(instruction, violations),
		violationCount: violations.length,
	};
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

	const groupedHints = new Map<PostTranslationGuardId, string[]>();

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
