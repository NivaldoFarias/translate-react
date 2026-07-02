import type { PostTranslationValidationGuard } from "../validation.types";

import {
	buildMarkdownLinkRetryHint,
	findMarkdownLinkViolations,
	formatMarkdownLinkViolationSummary,
} from "../analyzers/markdown-link.analyzer";
import { POST_TRANSLATION_GUARD_IDS } from "../validation.constants";

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

	return {
		guardId: POST_TRANSLATION_GUARD_IDS.markdownLinksPreserved,
		message: `Markdown links: ${formatMarkdownLinkViolationSummary(violations)}`,
		retryHint: buildMarkdownLinkRetryHint(violations),
	};
};
