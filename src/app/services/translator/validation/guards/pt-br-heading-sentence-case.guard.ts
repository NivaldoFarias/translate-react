import type { PostTranslationValidationGuard } from "../validation.types";

import { env } from "@/app/utils/";

import {
	buildPtBrHeadingSentenceCaseRetryHint,
	findPtBrHeadingSentenceCaseViolations,
} from "../analyzers/pt-br-heading-style.analyzer";

/**
 * Rejects pt-br translations whose headings use English-style Title Case.
 *
 * @param _source Original markdown (unused; style applies to translated headings)
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when heading case is acceptable
 */
export const ptBrHeadingSentenceCaseGuard: PostTranslationValidationGuard = (
	_source,
	translated,
) => {
	if (env.TARGET_LANGUAGE !== "pt-br") return null;

	const violations = findPtBrHeadingSentenceCaseViolations(translated);
	if (violations.length === 0) return null;

	const summary = violations
		.slice(0, 3)
		.map(({ heading, word }) => `${word} in "${heading}"`)
		.join("; ");

	return {
		guardId: "ptBrHeadingSentenceCase",
		message: `Heading sentence case: ${summary}`,
		retryHint: buildPtBrHeadingSentenceCaseRetryHint(violations),
	};
};
