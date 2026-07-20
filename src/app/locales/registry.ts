import type { ReactLanguageCode } from "@/app/utils/";

import type { LocaleDefinition } from "./types";

import { ptBrLocale } from "./pt-br/locale";
import { ruLocale } from "./ru/locale";

/** Registered locale definitions keyed by `TARGET_LANGUAGE` */
export const LOCALE_DEFINITIONS = {
	"pt-br": ptBrLocale,
	"ru": ruLocale,
} as const satisfies Partial<Record<ReactLanguageCode, LocaleDefinition>>;

/**
 * Lists language codes with registered locale definitions.
 *
 * @returns Registered `TARGET_LANGUAGE` codes
 */
export function getAvailableLocales(): ReactLanguageCode[] {
	return Object.keys(LOCALE_DEFINITIONS) as ReactLanguageCode[];
}

/**
 * Checks whether a locale definition is registered for a language code.
 *
 * @param languageCode Language code to check
 *
 * @returns `true` when a locale definition exists for the code
 */
export function hasLocaleDefinition(languageCode: ReactLanguageCode): boolean {
	return languageCode in LOCALE_DEFINITIONS;
}

/**
 * Resolves the locale definition for a target language.
 *
 * @param languageCode Configured `TARGET_LANGUAGE` code
 *
 * @returns Locale definition when registered; otherwise `undefined`
 */
export function resolveLocaleDefinition(
	languageCode: ReactLanguageCode,
): LocaleDefinition | undefined {
	return LOCALE_DEFINITIONS[languageCode as keyof typeof LOCALE_DEFINITIONS];
}
