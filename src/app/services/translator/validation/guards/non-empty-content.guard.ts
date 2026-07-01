import type { PostTranslationValidationGuard } from "../validation.types";

import { POST_TRANSLATION_GUARD_IDS } from "../validation.constants";

/**
 * Rejects empty or whitespace-only translations
 *
 * @param _source Original markdown (unused; guard only inspects output)
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when content is non-empty
 */
export const nonEmptyContentGuard: PostTranslationValidationGuard = (_source, translated) => {
	if (translated.trim().length > 0) return null;

	return {
		guardId: POST_TRANSLATION_GUARD_IDS.nonEmptyContent,
		message: "Translation produced empty content",
		retryHint:
			"Return the full translated document. Do not omit sections or return only whitespace.",
	};
};
