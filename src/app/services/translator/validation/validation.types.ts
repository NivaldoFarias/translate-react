import type { ReviewerValidationNotice, TranslationRetryInfo } from "@/app/services/github/types";

export type { ReviewerValidationNotice, TranslationRetryInfo };

/** Result of partitioning post-translation validation issues */
export interface PostTranslationValidationPartition {
	/** Issues that must fail the workflow (no PR) */
	readonly blocking: readonly TranslationValidationIssue[];

	/** Mechanical guard failures that still ship with reviewer hints on the PR */
	readonly advisory: readonly ReviewerValidationNotice[];
}

/**
 * Issue raised by a post-translation guard when output fails validation.
 */
export interface TranslationValidationIssue extends TranslationRetryInfo {
	/** Actionable hint for maintainers (also surfaced on the translation PR when advisory) */
	retryHint: string;
}

/** Optional context for post-translation guards */
export interface PostTranslationValidationOptions {
	/** Upstream glossary markdown (`GLOSSARY.md`) when loaded */
	readonly translationGuidelines?: string | null;
}

/**
 * Post-translation check that may return a retryable issue with an LLM hint.
 */
export type PostTranslationValidationGuard = (
	sourceContent: string,
	translatedContent: string,
	options?: PostTranslationValidationOptions,
) => TranslationValidationIssue | null;
