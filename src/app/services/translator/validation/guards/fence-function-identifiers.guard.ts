import type { PostTranslationValidationGuard } from "../validation.types";

import {
	buildFenceFunctionIdentifierRetryHint,
	findFenceFunctionIdentifierMismatches,
} from "../analyzers/fence-code-identifier.analyzer";

/** Rejects translations that renamed `function` identifiers inside fenced code blocks */
export const fenceFunctionIdentifiersGuard: PostTranslationValidationGuard = (
	source,
	translated,
) => {
	const mismatches = findFenceFunctionIdentifierMismatches(source, translated);
	if (mismatches.length === 0) return null;

	const names = mismatches.map(({ sourceName }) => sourceName).join(", ");

	return {
		guardId: "fenceFunctionIdentifiers",
		message: `Function identifiers changed in fenced code: ${names}`,
		retryHint: buildFenceFunctionIdentifierRetryHint(mismatches),
	};
};
