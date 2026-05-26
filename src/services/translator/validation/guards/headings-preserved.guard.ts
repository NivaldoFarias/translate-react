import type { PostTranslationValidationGuard } from "../validation.types";

import { MARKDOWN_REGEXES } from "../../markdown/markdown.regexes";

/** Rejects translations that removed every markdown heading */
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
