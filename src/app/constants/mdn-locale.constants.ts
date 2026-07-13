import type { ReactLanguageCode } from "./react-translation.constants";

/** MDN `developer.mozilla.org` locale slug for each supported translation target */
export const MDN_LOCALE_SLUG_BY_TARGET_LANGUAGE = {
	"pt-br": "pt-BR",
	"ru": "ru",
} as const satisfies Partial<Record<ReactLanguageCode, string>>;

/**
 * Resolves the MDN locale slug for a translation target language.
 *
 * @param targetLanguage Configured `TARGET_LANGUAGE` code
 *
 * @returns MDN path locale segment when mapped; otherwise `undefined`
 */
export function resolveMdnLocaleSlug(targetLanguage: ReactLanguageCode): string | undefined {
	return MDN_LOCALE_SLUG_BY_TARGET_LANGUAGE[
		targetLanguage as keyof typeof MDN_LOCALE_SLUG_BY_TARGET_LANGUAGE
	];
}
