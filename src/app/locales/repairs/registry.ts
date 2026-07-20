import type { ReactLanguageCode } from "@/app/utils/";

import type { LocaleMechanicalRepairs, LocaleMechanicalRepairsFn } from "./types";

import { ptBrLocaleMechanicalRepairs } from "../pt-br/repairs";
import { ruLocaleMechanicalRepairs } from "../ru/repairs";

/** Locale mechanical repair handles keyed by `TARGET_LANGUAGE` */
export const LOCALE_MECHANICAL_REPAIRS_HANDLES = {
	"pt-br": ptBrLocaleMechanicalRepairs,
	"ru": ruLocaleMechanicalRepairs,
} as const satisfies Partial<Record<ReactLanguageCode, LocaleMechanicalRepairs>>;

/** Registered locale mechanical repair hooks keyed by `TARGET_LANGUAGE` */
export const LOCALE_MECHANICAL_REPAIRS_REGISTRY = {
	"pt-br": ptBrLocaleMechanicalRepairs.apply.bind(ptBrLocaleMechanicalRepairs),
	"ru": ruLocaleMechanicalRepairs.apply.bind(ruLocaleMechanicalRepairs),
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

/**
 * Resolves the locale mechanical repair handle for a target language.
 *
 * @param targetLanguage Configured `TARGET_LANGUAGE` code
 *
 * @returns Locale repair handle when registered; otherwise `undefined`
 */
export function resolveLocaleMechanicalRepairsHandle(targetLanguage: ReactLanguageCode) {
	return LOCALE_MECHANICAL_REPAIRS_HANDLES[
		targetLanguage as keyof typeof LOCALE_MECHANICAL_REPAIRS_HANDLES
	];
}
