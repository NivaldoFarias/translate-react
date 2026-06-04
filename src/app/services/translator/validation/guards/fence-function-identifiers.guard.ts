import type { PostTranslationValidationGuard } from "../validation.types";

import {
	buildFenceFunctionIdentifierRetryHint,
	findFenceFunctionIdentifierMismatches,
	formatFenceFunctionMismatchSummary,
} from "../analyzers/fence-code-identifier.analyzer";

/**
 * Rejects translations that renamed `function` identifiers inside fenced code blocks
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when fenced identifiers match
 */
export const fenceFunctionIdentifiersGuard: PostTranslationValidationGuard = (
	source,
	translated,
) => {
	const mismatches = findFenceFunctionIdentifierMismatches(source, translated);
	if (mismatches.length === 0) return null;

	return {
		guardId: "fenceFunctionIdentifiers",
		message: `Function identifiers changed in fenced code: ${formatFenceFunctionMismatchSummary(mismatches)}`,
		retryHint: buildFenceFunctionIdentifierRetryHint(mismatches),
	};
};
