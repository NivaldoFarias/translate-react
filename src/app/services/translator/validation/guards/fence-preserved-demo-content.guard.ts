import type { PostTranslationValidationGuard } from "../validation.types";

import { env } from "@/app/utils/";

import {
	buildFencePreservedContentRetryHint,
	findFencePreservedDemoContentMismatches,
	findFenceReactCommentTermMismatches,
} from "../analyzers/fence-preserved-demo-content.analyzer";

/**
 * Rejects pt-br translations that altered demo UI strings or React terms inside fenced code.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when fence demo content matches
 */
export const fencePreservedDemoContentGuard: PostTranslationValidationGuard = (
	source,
	translated,
) => {
	if (env.TARGET_LANGUAGE !== "pt-br") return null;

	const demoMismatches = findFencePreservedDemoContentMismatches(source, translated);
	const commentTermMismatches = findFenceReactCommentTermMismatches(source, translated);

	if (demoMismatches.length === 0 && commentTermMismatches.length === 0) return null;

	const snippets = [...demoMismatches, ...commentTermMismatches]
		.map(({ sourceSnippet }) => sourceSnippet)
		.slice(0, 6)
		.join(", ");

	return {
		guardId: "fencePreservedDemoContent",
		message: `Fenced demo content or React comment terms changed: ${snippets}`,
		retryHint: buildFencePreservedContentRetryHint(demoMismatches, commentTermMismatches),
	};
};
