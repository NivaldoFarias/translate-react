import type {
	PostTranslationValidationPartition,
	ReviewerValidationNotice,
	TranslationValidationIssue,
} from "./validation.types";

import { PostTranslationGuardId } from "./validation.constants";

/** Guard ids that block shipping; all other guard failures are advisory for maintainers */
export const BLOCKING_POST_TRANSLATION_GUARD_IDS = new Set<PostTranslationGuardId>([
	PostTranslationGuardId.contentRatio,
	PostTranslationGuardId.nonEmptyContent,
]);

/**
 * Splits post-translation issues into blocking failures and advisory reviewer notices.
 *
 * @param issues All issues from {@link collectPostTranslationValidationIssues}
 *
 * @returns Blocking issues (workflow must fail) and advisory notices (ship with PR hints)
 */
export function partitionPostTranslationValidationIssues(
	issues: readonly TranslationValidationIssue[],
): PostTranslationValidationPartition {
	const blocking: TranslationValidationIssue[] = [];
	const advisory: ReviewerValidationNotice[] = [];

	for (const issue of issues) {
		if (BLOCKING_POST_TRANSLATION_GUARD_IDS.has(issue.guardId)) {
			blocking.push(issue);
			continue;
		}

		advisory.push({ guardId: issue.guardId, hint: issue.retryHint });
	}

	return { blocking, advisory };
}
