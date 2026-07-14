import type { ReactLanguageCode } from "@/app/utils/";

import { applyRuLocaleMechanicalRepairs } from "./ru/repairs";

/** Deterministic post-translation repair pass scoped to one target locale */
export type LocaleMechanicalRepairsFn = (content: string) => string;

/** Registered locale mechanical repair hooks keyed by `TARGET_LANGUAGE` */
export const LOCALE_MECHANICAL_REPAIRS_REGISTRY = {
	ru: applyRuLocaleMechanicalRepairs,
} as const satisfies Partial<Record<ReactLanguageCode, LocaleMechanicalRepairsFn>>;

/**
 * Resolves the mechanical repair hook for a translation target language.
 *
 * @param targetLanguage Configured `TARGET_LANGUAGE` code
 *
 * @returns Locale repair function when registered; otherwise `undefined`
 */
export function resolveLocaleMechanicalRepairs(
	targetLanguage: ReactLanguageCode,
): LocaleMechanicalRepairsFn | undefined {
	return LOCALE_MECHANICAL_REPAIRS_REGISTRY[
		targetLanguage as keyof typeof LOCALE_MECHANICAL_REPAIRS_REGISTRY
	];
}
