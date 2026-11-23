import type {
	PostTranslationValidationGuard,
	PostTranslationValidationOptions,
	TranslationValidationIssue,
} from "../validation.types";

import {
	extraMarkdownLinksGuard,
	mdxSpacingGuard,
	sentenceCaseHeadingsGuard,
} from "./advisory-style.guard";
import { contentRatioGuard } from "./content-ratio.guard";
import { fenceFunctionIdentifiersGuard } from "./fence-function-identifiers.guard";
import { fenceJsxStaticTextGuard } from "./fence-jsx-static-text.guard";
import { frontmatterPreservedGuard } from "./frontmatter-preserved.guard";
import { headingsPreservedGuard } from "./headings-preserved.guard";
import { markdownLinksPreservedGuard } from "./markdown-links-preserved.guard";
import { nonEmptyContentGuard } from "./non-empty-content.guard";
import {
	headingCountPreservedGuard,
	headingSyntaxGuard,
	mdxSlugPreservedGuard,
} from "./structural-integrity.guard";

/** Ordered post-translation guards; each may contribute one retry hint */
export const POST_TRANSLATION_VALIDATION_GUARDS = [
	nonEmptyContentGuard,
	contentRatioGuard,
	mdxSlugPreservedGuard,
	headingCountPreservedGuard,
	headingSyntaxGuard,
	headingsPreservedGuard,
	markdownLinksPreservedGuard,
	frontmatterPreservedGuard,
	fenceFunctionIdentifiersGuard,
	fenceJsxStaticTextGuard,
	sentenceCaseHeadingsGuard,
	mdxSpacingGuard,
	extraMarkdownLinksGuard,
] as const;

/**
 * Runs the shared post-translation guards plus any locale-scoped guards and returns every issue found.
 *
 * @param sourceContent Original markdown
 * @param translatedContent Translated markdown
 * @param options Guard context, including guards declared by the target locale
 *
 * @returns Retryable issues with accumulated hints
 */
export function collectPostTranslationValidationIssues(
	sourceContent: string,
	translatedContent: string,
	options?: PostTranslationValidationOptions,
) {
	const issues: TranslationValidationIssue[] = [];

	const guards: readonly PostTranslationValidationGuard[] = [
		...POST_TRANSLATION_VALIDATION_GUARDS,
		...(options?.localeGuards ?? []),
	];

	for (const guard of guards) {
		const issue = guard(sourceContent, translatedContent, options);
		if (issue) issues.push(issue);
	}

	return issues;
}
