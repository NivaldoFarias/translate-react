/**
 * Issue raised by a post-translation guard when output must be rejected and retried.
 */
export interface TranslationValidationIssue {
	/** Stable guard id for logs and error context */
	guardId: string;

	/** Short description for operators and error messages */
	message: string;

	/** Instruction appended to the LLM system prompt on the next attempt */
	retryHint: string;
}

/** Retry info for logging and PR metadata (excludes internal LLM hints) */
export type TranslationRetryInfo = Pick<TranslationValidationIssue, "guardId" | "message">;

/**
 * Post-translation check that may return a retryable issue with an LLM hint.
 */
export type PostTranslationValidationGuard = (
	sourceContent: string,
	translatedContent: string,
) => TranslationValidationIssue | null;
