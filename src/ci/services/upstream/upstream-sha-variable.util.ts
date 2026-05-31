/**
 * Builds the repository variable name that stores the last processed upstream `main` SHA for a locale.
 *
 * GitHub variable names allow letters, digits, and underscores only (`pt-br` → `PT_BR`).
 *
 * @param lang Locale id from `.github/upstream-locales.json` (e.g. `pt-br`, `ru`)
 *
 * @returns Variable name such as `UPSTREAM_SHA_PT_BR`
 *
 * @example
 * ```typescript
 * resolveUpstreamShaVariableName("pt-br");
 * // ^? "UPSTREAM_SHA_PT_BR"
 * ```
 */
export function resolveUpstreamShaVariableName(lang: string) {
	const suffix = lang.toUpperCase().replaceAll("-", "_");

	return `UPSTREAM_SHA_${suffix}`;
}
