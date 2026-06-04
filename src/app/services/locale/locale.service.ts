import type { LocaleDefinition } from "@/app/locales/";
import type { ReactLanguageCode } from "@/app/utils/";

import { ptBrLocale, ruLocale } from "@/app/locales/";
import { env, logger } from "@/app/utils/";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

/**
 * Service for retrieving locale-specific text content.
 *
 * @example
 * ```typescript
 * const localeService = new LocaleService(env.TARGET_LANGUAGE);
 * const commentPrefix = localeService.definitions.comment.prefix();
 * const rules = localeService.definitions.rules.specific;
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
		"ru": ruLocale,
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
	 * @returns The locale definition for the language code
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.InitializationError|`"INITIALIZATION_ERROR"`} when no locale is registered
	 */
	private resolveLocale(languageCode: ReactLanguageCode): LocaleDefinition {
		const locale = this.localeRegistry[languageCode];

		if (locale) return locale;

		const registeredLocales = this.getAvailableLocales();

		throw new ApplicationError(
			`Locale definition is not registered for '${languageCode}'`,
			ErrorCode.InitializationError,
			`${LocaleService.name}.${this.resolveLocale.name}`,
			{ requestedLocale: languageCode, registeredLocales },
		);
	}
}

/** Pre-configured instance of {@link LocaleService} for application-wide use */
