import type { PostTranslationValidationGuard } from "../validation.types";

import { MARKDOWN_REGEXES } from "../../markdown/markdown.regexes";

/**
 * Rejects translations that removed every markdown heading
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when headings are preserved
 */
export const headingsPreservedGuard: PostTranslationValidationGuard = (source, translated) => {
	const originalHeadings = (source.match(MARKDOWN_REGEXES.headings) ?? []).length;
	const translatedHeadings = (translated.match(MARKDOWN_REGEXES.headings) ?? []).length;

	if (originalHeadings === 0 || translatedHeadings > 0) return null;

	return {
		guardId: "headingsPreserved",
		message: "All markdown headings lost during translation",
		retryHint:
			"Preserve every markdown heading (`#` through `######`) from the source. Translate heading text only; do not remove headings.",
	};
};
