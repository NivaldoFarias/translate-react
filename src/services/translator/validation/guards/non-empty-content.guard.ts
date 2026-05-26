import type { PostTranslationValidationGuard } from "../validation.types";

/** Rejects empty or whitespace-only translations */
export const nonEmptyContentGuard: PostTranslationValidationGuard = (_source, translated) => {
	if (translated.trim().length > 0) return null;

	return {
		guardId: "nonEmptyContent",
		message: "Translation produced empty content",
		retryHint:
			"Return the full translated document. Do not omit sections or return only whitespace.",
	};
};
