import type { PostTranslationValidationGuard } from "../validation.types";

import {
	countMarkdownHeadings,
	findDuplicatedHeadingMarkerLines,
	findMissingMdxSlugComments,
} from "../analyzers/structural-integrity.analyzer";
import { PostTranslationGuardId } from "../validation.constants";

/**
 * Rejects translations that altered or removed MDX heading slug comments.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when all slug comments are preserved
 */
export const mdxSlugPreservedGuard: PostTranslationValidationGuard = (source, translated) => {
	const missing = findMissingMdxSlugComments(source, translated);

	if (missing.length === 0) {
		return null;
	}

	const sample = missing.slice(0, 5).join(", ");

	return {
		guardId: PostTranslationGuardId.mdxSlugPreserved,
		message: `MDX slug comments missing or altered (${missing.length}): ${sample}`,
		retryHint:
			"Keep every `{/*slug-id*/}` comment exactly as in the source (English ids). Translate only visible heading and body text.",
	};
};

/**
 * Rejects translations that removed markdown heading lines from the source.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when heading counts match
 */
export const headingCountPreservedGuard: PostTranslationValidationGuard = (source, translated) => {
	const sourceCount = countMarkdownHeadings(source);
	const translatedCount = countMarkdownHeadings(translated);

	if (sourceCount === 0 || sourceCount === translatedCount) {
		return null;
	}

	return {
		guardId: PostTranslationGuardId.headingCountPreserved,
		message: `Heading count mismatch (source ${sourceCount}, translated ${translatedCount})`,
		retryHint:
			"Preserve every markdown heading from the source. Translate heading text only; do not remove sections or collapse headings.",
	};
};

/**
 * Rejects duplicated markdown heading markers such as `## ## Title`.
 *
 * @param _source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when heading syntax is valid
 */
export const headingSyntaxGuard: PostTranslationValidationGuard = (_source, translated) => {
	const violations = findDuplicatedHeadingMarkerLines(translated);

	if (violations.length === 0) {
		return null;
	}

	return {
		guardId: PostTranslationGuardId.headingSyntax,
		message: `Duplicated heading markers detected: ${violations.join(" | ")}`,
		retryHint:
			"Translate heading text only. Do not repeat markdown `#` markers that already exist outside the translatable segment.",
	};
};
