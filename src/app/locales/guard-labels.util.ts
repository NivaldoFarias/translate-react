import type { PostTranslationGuardId } from "@/app/services/translator/validation/validation.constants";

/**
 * Builds a locale-specific advisory guard label resolver from a full guard-id map.
 *
 * @param labels Localized display name for every post-translation guard id
 *
 * @returns Resolver used in PR reviewer-warning sections
 */
export function createGuardLabelResolver(labels: Record<PostTranslationGuardId, string>) {
	return (guardId: PostTranslationGuardId) => labels[guardId];
}
