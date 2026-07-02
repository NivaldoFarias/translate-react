import { describe, expect, test } from "bun:test";

import {
	filterUpstreamLocalesByLang,
	loadUpstreamLocales,
	resolveForkOwner,
} from "@/ci/services/upstream/upstream-locales.util";

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

	test("resolveForkOwner returns default when row omits fork_owner", () => {
		const locales = loadUpstreamLocales();
		const ptBr = locales.find((row) => row.lang === "pt-br");

		if (!ptBr) {
			throw new Error("Expected pt-br locale in registry");
		}

		expect(resolveForkOwner(ptBr, "workflow-default")).toBe("workflow-default");
	});

	test("resolveForkOwner returns trimmed per-row fork_owner when set", () => {
		expect(
			resolveForkOwner(
				{
					lang: "ru",
					upstream_owner: "reactjs",
					upstream_name: "ru.react.dev",
					fork_name: "ru.react.dev",
					translation_guidelines_file: "TRANSLATION.md",
					fork_owner: "  custom-org  ",
				},
				"workflow-default",
			),
		).toBe("custom-org");
	});
});
