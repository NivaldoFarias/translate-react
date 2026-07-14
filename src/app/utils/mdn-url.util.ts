/** Matches MDN docs URLs with a locale segment before `/docs/` */
const MDN_DOCS_URL_WITH_LOCALE =
	/^https:\/\/developer\.mozilla\.org\/[a-z]{2}(?:-[A-Z]{2})?(\/docs\/.+)$/;

/**
 * Normalizes MDN docs URLs for markdown link guard comparison.
 *
 * Locale rewrites (`en-US` → `ru`, etc.) compare equal while non-MDN URLs are unchanged.
 *
 * @param url Markdown link destination
 *
 * @returns Locale-neutral MDN docs URL, or the original URL
 */
export function canonicalizeMarkdownLinkUrlForComparison(url: string) {
	const match = MDN_DOCS_URL_WITH_LOCALE.exec(url);

	if (!match) {
		return url;
	}

	return `https://developer.mozilla.org${match[1]}`;
}
