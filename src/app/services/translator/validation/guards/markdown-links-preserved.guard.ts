import type { PostTranslationValidationGuard } from "../validation.types";

import {
	buildMarkdownLinkRetryHint,
	findMarkdownLinkViolations,
} from "../analyzers/markdown-link.analyzer";

/**
 * Rejects translations that dropped or broke markdown links from the source.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when link structure is preserved
 */
export const markdownLinksPreservedGuard: PostTranslationValidationGuard = (source, translated) => {
	const violations = findMarkdownLinkViolations(source, translated);
	if (violations.length === 0) return null;

	const summary = violations
		.slice(0, 3)
		.map((violation) => violation.message)
		.join("; ");

	return {
		guardId: "markdownLinksPreserved",
		message: `Markdown links: ${summary}`,
		retryHint: buildMarkdownLinkRetryHint(violations),
	};
};
