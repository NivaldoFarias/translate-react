import type { PostTranslationValidationGuard } from "../validation.types";

import {
	findExtraMarkdownLinks,
	findMdxSpacingViolations,
	findSentenceCaseHeadingViolations,
} from "../analyzers/advisory-style.analyzer";
import { PostTranslationGuardId } from "../validation.constants";

/**
 * Flags likely Title Case violations in pt-br markdown headings.
 *
 * @param _source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Advisory guard failure, or `null` when headings follow sentence case
 */
export const sentenceCaseHeadingsGuard: PostTranslationValidationGuard = (_source, translated) => {
	const violations = findSentenceCaseHeadingViolations(translated);

	if (violations.length === 0) {
		return null;
	}

	const sample = violations.slice(0, 3).join(" | ");

	return {
		guardId: PostTranslationGuardId.sentenceCaseHeadings,
		message: `Heading sentence case issues: ${sample}`,
		retryHint:
			"Use sentence case in headings: capitalize only the first word and proper nouns (React, JSX, API, etc.).",
	};
};

/**
 * Flags mechanical MDX spacing regressions such as prose glued to links or slug comments.
 *
 * @param _source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Advisory guard failure, or `null` when spacing invariants hold
 */
export const mdxSpacingGuard: PostTranslationValidationGuard = (_source, translated) => {
	const violations = findMdxSpacingViolations(translated);

	if (violations.length === 0) {
		return null;
	}

	return {
		guardId: PostTranslationGuardId.mdxSpacing,
		message: `MDX spacing issues detected: ${violations.join(" | ")}`,
		retryHint:
			"Preserve spaces around markdown links, inline code, and `{/*slug*/}` comments exactly as structural separators in prose.",
	};
};

/**
 * Flags markdown links introduced during translation that were not in the source.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Advisory guard failure, or `null` when no extra links are present
 */
export const extraMarkdownLinksGuard: PostTranslationValidationGuard = (source, translated) => {
	const extra = findExtraMarkdownLinks(source, translated);

	if (extra.length === 0) {
		return null;
	}

	const sample = extra.slice(0, 3).join(" | ");

	return {
		guardId: PostTranslationGuardId.extraMarkdownLinks,
		message: `Extra markdown link URLs not present in source: ${sample}`,
		retryHint:
			"Do not add markdown links or URLs that are absent from the source document. Translate existing link labels only.",
	};
};
