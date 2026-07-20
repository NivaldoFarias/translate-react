import { describe, expect, test } from "bun:test";

import type { ReactLanguageCode } from "@/app/utils/";

import { getAvailableLocales } from "@/app/locales/registry";
import { REACT_TRANSLATION_LANGUAGES } from "@/app/utils/";
import { loadUpstreamLocales } from "@/ci/services/upstream/upstream-locales.util";

describe("locale registry parity", () => {
	test("every .github/locales.json row has a locale definition", () => {
		const registered = new Set(getAvailableLocales());

		for (const row of loadUpstreamLocales()) {
			expect(registered.has(row.lang as ReactLanguageCode)).toBe(true);
			expect(REACT_TRANSLATION_LANGUAGES.includes(row.lang as ReactLanguageCode)).toBe(true);
		}
	});

	test("every locale definition has a .github/locales.json row", () => {
		const configured = new Set(loadUpstreamLocales().map((row) => row.lang));

		for (const lang of getAvailableLocales()) {
			expect(configured.has(lang)).toBe(true);
		}
	});
});
