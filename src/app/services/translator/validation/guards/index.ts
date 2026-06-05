import type {
	PostTranslationValidationOptions,
	TranslationValidationIssue,
} from "../validation.types";

import { contentRatioGuard } from "./content-ratio.guard";
import { fenceFunctionIdentifiersGuard } from "./fence-function-identifiers.guard";
import { fenceJsxStaticTextGuard } from "./fence-jsx-static-text.guard";
import { frontmatterPreservedGuard } from "./frontmatter-preserved.guard";
import { headingsPreservedGuard } from "./headings-preserved.guard";
import { markdownLinksPreservedGuard } from "./markdown-links-preserved.guard";
import { nonEmptyContentGuard } from "./non-empty-content.guard";

/** Ordered post-translation guards; each may contribute one retry hint */
export const POST_TRANSLATION_VALIDATION_GUARDS = [
	nonEmptyContentGuard,
	contentRatioGuard,
	headingsPreservedGuard,
	markdownLinksPreservedGuard,
	frontmatterPreservedGuard,
	fenceFunctionIdentifiersGuard,
	fenceJsxStaticTextGuard,
] as const;

/**
 * Runs all post-translation guards and returns every issue found.
 *
 * @param sourceContent Original markdown
 * @param translatedContent Translated markdown
 * @param _options Reserved for future guard context
 *
 * @returns Retryable issues with accumulated hints
 */
export function collectPostTranslationValidationIssues(
	sourceContent: string,
	translatedContent: string,
	_options?: PostTranslationValidationOptions,
) {
	const issues: TranslationValidationIssue[] = [];

	for (const guard of POST_TRANSLATION_VALIDATION_GUARDS) {
		const issue = guard(sourceContent, translatedContent);
		if (issue) issues.push(issue);
	}

	return issues;
}
