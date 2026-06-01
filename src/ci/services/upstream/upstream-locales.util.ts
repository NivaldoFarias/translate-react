import { readFileSync } from "node:fs";
import path from "node:path";

import type { UpstreamLocaleConfig } from "./types";

import { upstreamLocalesFileSchema } from "./types";

/** Default path to the Actions locale registry (repo root relative). */
export const DEFAULT_UPSTREAM_LOCALES_PATH = ".github/locales.json";

/**
 * Loads and validates `.github/locales.json`.
 *
 * @param configPath Path to the JSON file (defaults to {@link DEFAULT_UPSTREAM_LOCALES_PATH})
 *
 * @returns Parsed locale rows
 *
 * @example
 * ```typescript
 * const locales = loadUpstreamLocales();
 * console.log(locales[0]?.lang);
 * // ^? "pt-br"
 * ```
 */
export function loadUpstreamLocales(configPath = DEFAULT_UPSTREAM_LOCALES_PATH) {
	const absolutePath =
		path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
	const raw: unknown = JSON.parse(readFileSync(absolutePath, "utf8"));

	return upstreamLocalesFileSchema.parse(raw);
}

/**
 * Filters configured locales by an optional allow-list of `lang` values.
 *
 * @param locales Full registry from {@link loadUpstreamLocales}
 * @param langs When non-empty, only rows whose `lang` is listed are returned
 *
 * @returns Subset of `locales`
 */
export function filterUpstreamLocalesByLang(
	locales: UpstreamLocaleConfig[],
	langs: readonly string[],
) {
	if (langs.length === 0) {
		return locales;
	}

	const allowed = new Set(langs);

	return locales.filter((row) => allowed.has(row.lang));
}
