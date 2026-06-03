import { describe, expect, test } from "bun:test";

import type { ReactLanguageCode } from "@/app/utils/";

import { LocaleService } from "@/app/services/locale/locale.service";
import { REACT_TRANSLATION_LANGUAGES } from "@/app/utils/";
import { loadUpstreamLocales } from "@/ci/services/upstream/upstream-locales.util";

describe("locale registry parity", () => {
	test("every .github/locales.json row has a LocaleService definition", () => {
		const registered = new Set(new LocaleService("pt-br").getAvailableLocales());

		for (const row of loadUpstreamLocales()) {
			expect(registered.has(row.lang as ReactLanguageCode)).toBe(true);
			expect(REACT_TRANSLATION_LANGUAGES.includes(row.lang as ReactLanguageCode)).toBe(true);
		}
	});

	test("every LocaleService definition has a .github/locales.json row", () => {
		const configured = new Set(loadUpstreamLocales().map((row) => row.lang));

		for (const lang of new LocaleService("pt-br").getAvailableLocales()) {
			expect(configured.has(lang)).toBe(true);
		}
	});
});
