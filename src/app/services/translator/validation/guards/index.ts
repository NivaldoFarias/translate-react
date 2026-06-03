import type {
	PostTranslationValidationOptions,
	TranslationValidationIssue,
} from "../validation.types";

import { env } from "@/app/utils/";

import { contentRatioGuard } from "./content-ratio.guard";
import { fenceFunctionIdentifiersGuard } from "./fence-function-identifiers.guard";
import { fencePreservedDemoContentGuard } from "./fence-preserved-demo-content.guard";
import { frontmatterPreservedGuard } from "./frontmatter-preserved.guard";
import { glossaryTerminologyGuard } from "./glossary-terminology.guard";
import { headingsPreservedGuard } from "./headings-preserved.guard";
import { markdownLinksPreservedGuard } from "./markdown-links-preserved.guard";
import { nonEmptyContentGuard } from "./non-empty-content.guard";
import { ptBrHeadingSentenceCaseGuard } from "./pt-br-heading-sentence-case.guard";

/** Ordered post-translation guards; each may contribute one retry hint */
export const POST_TRANSLATION_VALIDATION_GUARDS = [
	nonEmptyContentGuard,
	contentRatioGuard,
	headingsPreservedGuard,
	markdownLinksPreservedGuard,
	frontmatterPreservedGuard,
	fenceFunctionIdentifiersGuard,
	...(env.TARGET_LANGUAGE === "pt-br" ?
		[fencePreservedDemoContentGuard, glossaryTerminologyGuard, ptBrHeadingSentenceCaseGuard]
	:	[]),
] as const;

/**
 * Runs all post-translation guards and returns every issue found.
 *
 * @param sourceContent Original markdown
 * @param translatedContent Translated markdown
 * @param options Optional glossary and locale context for terminology guards
 *
 * @returns Retryable issues with accumulated hints
 */
export function collectPostTranslationValidationIssues(
	sourceContent: string,
	translatedContent: string,
	options?: PostTranslationValidationOptions,
) {
	const issues: TranslationValidationIssue[] = [];

	for (const guard of POST_TRANSLATION_VALIDATION_GUARDS) {
		const issue = guard(sourceContent, translatedContent, options);
		if (issue) issues.push(issue);
	}

	return issues;
}
