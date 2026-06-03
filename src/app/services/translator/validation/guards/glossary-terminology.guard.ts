import type { PostTranslationValidationGuard } from "../validation.types";

import { env } from "@/app/utils/";

import {
	buildTerminologyRetryHint,
	findAllTerminologyViolations,
} from "../analyzers/terminology.analyzer";

/**
 * Rejects pt-br translations that violate glossary, protected-term, or consistency rules.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 * @param options Optional validation context including upstream glossary text
 *
 * @returns Guard failure with retry hint, or `null` when terminology checks pass
 */
export const glossaryTerminologyGuard: PostTranslationValidationGuard = (
	source,
	translated,
	options,
) => {
	if (env.TARGET_LANGUAGE !== "pt-br") return null;

	const violations = findAllTerminologyViolations(
		source,
		translated,
		options?.translationGuidelines,
	);

	if (violations.length === 0) return null;

	const summary = violations
		.slice(0, 3)
		.map((violation) => violation.message)
		.join("; ");

	return {
		guardId: "glossaryTerminology",
		message: `Terminology: ${summary}`,
		retryHint: buildTerminologyRetryHint(violations),
	};
};
