/**
 * Common filenames for translation guidelines in React documentation repos.
 *
 * Used by auto-discovery to locate the translation guidelines file when no
 * explicit filename is provided. Files are checked in priority order.
 *
 * @see {@link https://github.com/reactjs/pt-br.react.dev/blob/main/GLOSSARY.md|pt-br uses GLOSSARY.md}
 * @see {@link https://github.com/reactjs/ru.react.dev/blob/main/TRANSLATION.md|ru uses TRANSLATION.md}
 */
export const TRANSLATION_GUIDELINES_CANDIDATES = [
	"GLOSSARY.md",
	"TRANSLATION.md",
	"TRANSLATING.md",
	"translation-glossary.md",
] as const;

/**
 * Official React documentation translation language codes.
 *
 * These are the 38 languages supported by the React community translation effort.
 *
 * @see {@link https://translations.react.dev/|`react.dev` Translation Repositories Homepage}
 */
export const REACT_TRANSLATION_LANGUAGES = [
	"ar",
	"az",
	"be",
	"bn",
	"cs",
	"de",
	"fa",
	"fi",
	"fr",
	"gu",
	"he",
	"hi",
	"hu",
	"id",
	"is",
	"it",
	"ja",
	"kk",
	"ko",
	"lo",
	"mk",
	"ml",
	"mn",
	"pl",
	"pt-br",
	"ru",
	"si",
	"sr",
	"sw",
	"ta",
	"te",
	"tr",
	"uk",
	"ur",
	"vi",
	"zh-hans",
	"zh-hant",
	"en",
] as const;

/** Type for React translation language codes */
export type ReactLanguageCode = (typeof REACT_TRANSLATION_LANGUAGES)[number];
