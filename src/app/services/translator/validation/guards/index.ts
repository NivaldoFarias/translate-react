import type { TranslationValidationIssue } from "../validation.types";

import { env } from "@/app/utils/";

import { contentRatioGuard } from "./content-ratio.guard";
import { fenceFunctionIdentifiersGuard } from "./fence-function-identifiers.guard";
import { fencePreservedDemoContentGuard } from "./fence-preserved-demo-content.guard";
import { frontmatterPreservedGuard } from "./frontmatter-preserved.guard";
import { headingsPreservedGuard } from "./headings-preserved.guard";
import { nonEmptyContentGuard } from "./non-empty-content.guard";

/** Ordered post-translation guards; each may contribute one retry hint */
export const POST_TRANSLATION_VALIDATION_GUARDS = [
	nonEmptyContentGuard,
	contentRatioGuard,
	headingsPreservedGuard,
	frontmatterPreservedGuard,
	fenceFunctionIdentifiersGuard,
	...(env.TARGET_LANGUAGE === "pt-br" ? [fencePreservedDemoContentGuard] : []),
] as const;

/**
 * Runs all post-translation guards and returns every issue found.
 *
 * @param sourceContent Original markdown
 * @param translatedContent Translated markdown
 *
 * @returns Retryable issues with accumulated hints
 */
export function collectPostTranslationValidationIssues(
	sourceContent: string,
	translatedContent: string,
) {
	const issues: TranslationValidationIssue[] = [];

	for (const guard of POST_TRANSLATION_VALIDATION_GUARDS) {
		const issue = guard(sourceContent, translatedContent);
		if (issue) issues.push(issue);
	}

	return issues;
}
