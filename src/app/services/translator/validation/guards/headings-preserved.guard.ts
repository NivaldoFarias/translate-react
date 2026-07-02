import type { PostTranslationValidationGuard } from "../validation.types";

import { MARKDOWN_REGEXES } from "../../markdown/markdown.regexes";
import { POST_TRANSLATION_GUARD_IDS } from "../validation.constants";

const FIRST_HEADING_LINE = /^#{1,6}\s.+$/m;

/** Every markdown heading removed from a translation that had headings in the source */
export interface HeadingsPreservedViolation {
	readonly firstHeadingText: string;
	readonly firstHeadingOffset: number;
}

/**
 * Detects when the source has headings but the translation removed all of them.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Violation metadata, or `null` when headings are preserved or absent in the source
 */
export function detectHeadingsPreservedViolation(
	source: string,
	translated: string,
): HeadingsPreservedViolation | null {
	const originalHeadings = (source.match(MARKDOWN_REGEXES.headings) ?? []).length;
	const translatedHeadings = (translated.match(MARKDOWN_REGEXES.headings) ?? []).length;

	if (originalHeadings === 0 || translatedHeadings > 0) {
		return null;
	}

	const firstHeading = FIRST_HEADING_LINE.exec(source);

	return {
		firstHeadingText: firstHeading?.[0].trim() ?? "All markdown headings were removed.",
		firstHeadingOffset: firstHeading?.index ?? 0,
	};
}

/**
 * Rejects translations that removed every markdown heading
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when headings are preserved
 */
export const headingsPreservedGuard: PostTranslationValidationGuard = (source, translated) => {
	const violation = detectHeadingsPreservedViolation(source, translated);
	if (!violation) return null;

	return {
		guardId: POST_TRANSLATION_GUARD_IDS.headingsPreserved,
		message: "All markdown headings lost during translation",
		retryHint:
			"Preserve every markdown heading (`#` through `######`) from the source. Translate heading text only; do not remove headings.",
	};
};
