import type { PostTranslationValidationGuard } from "../validation.types";

import {
	buildFenceJsxStaticTextRetryHint,
	findFenceJsxStaticTextMismatches,
	formatFenceJsxStaticTextMismatchSummary,
} from "../analyzers/fence-jsx-static-text.analyzer";

/**
 * Rejects translations that localized static JSX demo text inside fenced code blocks.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when JSX demo text matches the source
 */
export const fenceJsxStaticTextGuard: PostTranslationValidationGuard = (source, translated) => {
	const mismatches = findFenceJsxStaticTextMismatches(source, translated);
	if (mismatches.length === 0) return null;

	return {
		guardId: "fenceJsxStaticText",
		message: `JSX demo text changed in fenced code: ${formatFenceJsxStaticTextMismatchSummary(mismatches)}`,
		retryHint: buildFenceJsxStaticTextRetryHint(mismatches),
	};
};
