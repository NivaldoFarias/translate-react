import type { LocaleDefinition } from "@/locales/";
import type { ReactLanguageCode } from "@/utils/";

import { ptBrLocale } from "@/locales/";
import { env, logger } from "@/utils/";

/**
 * Registry of available locale definitions keyed by language code.
 *
 * Add new locales here as they are implemented. Each entry maps
 * a `ReactLanguageCode` to its corresponding `LocaleDefinition`.
 */
const localeRegistry: Partial<Record<ReactLanguageCode, LocaleDefinition>> = {
	"pt-br": ptBrLocale,
};

/**
 * Service for retrieving locale-specific text content.
 *
 * Provides access to user-facing texts and LLM rules based on the
 * configured `TARGET_LANGUAGE` environment variable. Implements a
 * singleton pattern per language code for efficiency.
 *
 * ### Usage
 *
 * The service can be used via dependency injection for testability,
 * or directly via the static `get()` method for simpler use cases.
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
	private static instances = new Map<ReactLanguageCode, LocaleService>();
	private static readonly logger = logger.child({ component: LocaleService.name });

	/** The resolved locale definition for this service instance */
	public readonly locale: LocaleDefinition;

	/** The language code this service instance is configured for */
	public readonly languageCode: ReactLanguageCode;

	/**
	 * Creates a new LocaleService instance for the specified language.
	 *
	 * @param languageCode Target language code to load locale for
	 */
	constructor(languageCode: ReactLanguageCode) {
		this.languageCode = languageCode;
		this.locale = this.resolveLocale(languageCode);
	}

	/**
	 * Gets a singleton LocaleService instance for the current target language.
	 *
	 * Uses `env.TARGET_LANGUAGE` to determine which locale to load.
	 * Returns a cached instance if one exists for the language code.
	 *
	 * @returns Singleton LocaleService instance for the target language
	 *
	 * @example
	 * ```typescript
	 * const locale = LocaleService.get();
	 * console.log(locale.comment.prefix);
	 * ```
	 */
	public static get(): LocaleService {
		const targetLanguage = env.TARGET_LANGUAGE;

		if (!this.instances.has(targetLanguage)) {
			this.instances.set(targetLanguage, new LocaleService(targetLanguage));
		}

		const instance = this.instances.get(targetLanguage);
		if (!instance) {
			throw new Error(`LocaleService instance for language ${targetLanguage} not found.`);
		}

		return instance;
	}

	/**
	 * Clears all cached LocaleService instances.
	 *
	 * Primarily used for testing to ensure clean state between tests.
	 */
	public static clearInstances(): void {
		this.instances.clear();
	}

	/**
	 * Checks if a locale definition exists for the given language code.
	 *
	 * @param languageCode Language code to check
	 *
	 * @returns `true` if a locale is registered for the language code
	 */
	public static hasLocale(languageCode: ReactLanguageCode): boolean {
		return languageCode in localeRegistry;
	}

	/**
	 * Gets all registered language codes that have locale definitions.
	 *
	 * @returns Array of language codes with available locales
	 */
	public static getAvailableLocales(): ReactLanguageCode[] {
		return Object.keys(localeRegistry) as ReactLanguageCode[];
	}

	/**
	 * Resolves the locale definition for a language code.
	 *
	 * Falls back to pt-br if the requested locale is not available,
	 * logging a warning to indicate the fallback.
	 *
	 * @param languageCode Language code to resolve locale for
	 *
	 * @returns The locale definition for the language or fallback
	 */
	private resolveLocale(languageCode: ReactLanguageCode): LocaleDefinition {
		const locale = localeRegistry[languageCode];

		if (locale) return locale;

		LocaleService.logger.warn(
			{ requestedLocale: languageCode, fallbackLocale: "pt-br" },
			"Locale not found, falling back to pt-br",
		);

		return ptBrLocale;
	}
}
