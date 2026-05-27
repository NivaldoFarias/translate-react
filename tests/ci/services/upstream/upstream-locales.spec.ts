import { describe, expect, test } from "bun:test";

import { filterUpstreamLocalesByLang, loadUpstreamLocales } from "@/ci/services/upstream/upstream-locales.util";

describe("upstream-locales.util", () => {
	test("loadUpstreamLocales reads configured registry", () => {
		const locales = loadUpstreamLocales();

		expect(locales.length).toBeGreaterThanOrEqual(2);
		expect(locales.some((row) => row.lang === "pt-br")).toBe(true);
		expect(locales.some((row) => row.lang === "ru")).toBe(true);
	});

	test("filterUpstreamLocalesByLang returns all rows when langs is empty", () => {
		const locales = loadUpstreamLocales();

		expect(filterUpstreamLocalesByLang(locales, [])).toHaveLength(locales.length);
	});

	test("filterUpstreamLocalesByLang keeps only requested langs", () => {
		const locales = loadUpstreamLocales();

		const filtered = filterUpstreamLocalesByLang(locales, ["ru"]);

		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.lang).toBe("ru");
	});
});
