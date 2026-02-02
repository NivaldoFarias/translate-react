import type { LocaleDefinition } from "@/locales";
import type { ReactLanguageCode } from "@/utils/";

import { ptBrLocale } from "@/locales";
import { env, logger } from "@/utils/";

/**
 * Service for retrieving locale-specific text content.
 *
 * @example
 * ```typescript
 * // Via DI (preferred for services requiring testability)
 * const localeService = new LocaleService('pt-br');
 * const commentPrefix = localeService.locale.comment.prefix;
 *
 * // Via static accessor (simpler, uses env.TARGET_LANGUAGE)
 * const locale = LocaleService.get();
 * const rules = locale.rules.specific;
 * ```
 */
export class LocaleService {
	private readonly logger = logger.child({ component: LocaleService.name });

	/** The resolved locale definition for this service instance */
	public readonly definitions: LocaleDefinition;

	/** The language code this service instance is configured for */
	public readonly languageCode: ReactLanguageCode;

	/** Registry of available locale definitions keyed by language code */
	public readonly localeRegistry: Partial<Record<ReactLanguageCode, LocaleDefinition>> = {
		"pt-br": ptBrLocale,
	};

	/**
	 * Creates a new LocaleService instance for the specified language.
	 *
	 * @param languageCode Target language code to load locale for
	 */
	constructor(languageCode: ReactLanguageCode = env.TARGET_LANGUAGE) {
		this.languageCode = languageCode;
		this.definitions = this.resolveLocale(languageCode);
	}

	/**
	 * Checks if a locale definition exists for the given language code.
	 *
	 * @param languageCode Language code to check
	 *
	 * @returns `true` if a locale is registered for the language code
	 */
	public hasLocale(languageCode: ReactLanguageCode): boolean {
		return languageCode in this.localeRegistry;
	}

	/**
	 * Gets all registered language codes that have locale definitions.
	 *
	 * @returns Array of language codes with available locales
	 */
	public getAvailableLocales(): ReactLanguageCode[] {
		return Object.keys(this.localeRegistry) as ReactLanguageCode[];
	}

	/**
	 * Resolves the locale definition for a language code.
	 *
	 * @param languageCode Language code to resolve locale for
	 *
	 * @returns The locale definition for the language or fallback
	 */
	private resolveLocale(languageCode: ReactLanguageCode): LocaleDefinition {
		const locale = this.localeRegistry[languageCode];

		if (locale) return locale;

		this.logger.warn(
			{ requestedLocale: languageCode, fallbackLocale: "pt-br" },
			"Locale not found, falling back to pt-br",
		);

		return ptBrLocale;
	}
}

/** Pre-configured instance of {@link LocaleService} for application-wide use */
export const localeService = new LocaleService();
