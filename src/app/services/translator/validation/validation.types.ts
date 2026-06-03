import type { TranslationRetryInfo } from "@/app/services/github/types";

export type { TranslationRetryInfo };

/**
 * Issue raised by a post-translation guard when output must be rejected and retried.
 */
export interface TranslationValidationIssue extends TranslationRetryInfo {
	/** Instruction appended to the LLM system prompt on the next attempt */
	retryHint: string;
}

/**
 * Post-translation check that may return a retryable issue with an LLM hint.
 */
export type PostTranslationValidationGuard = (
	sourceContent: string,
	translatedContent: string,
) => TranslationValidationIssue | null;
