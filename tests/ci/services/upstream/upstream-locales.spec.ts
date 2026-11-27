import { describe, expect, test } from "bun:test";

import { upstreamLocaleConfigSchema } from "@/ci/services/upstream/types";
import {
	filterScheduledLocales,
	filterUpstreamLocalesByLang,
	loadUpstreamLocales,
	resolveForkOwner,
} from "@/ci/services/upstream/upstream-locales.util";

const PT_BR_ROW = {
	lang: "pt-br",
	upstream_owner: "reactjs",
	upstream_name: "pt-br.react.dev",
	fork_name: "pt-br.react.dev",
	translation_guidelines_file: "GLOSSARY.md",
};

describe("upstream-locales.util", () => {
	test("loadUpstreamLocales reads configured registry", () => {
		const locales = loadUpstreamLocales();

		expect(locales.length).toBeGreaterThanOrEqual(2);
		expect(locales.some((row) => row.lang === "pt-br")).toBe(true);
		expect(locales.some((row) => row.lang === "ru")).toBe(true);
	});

	test("a row without scheduled is not scheduled", () => {
		const row = upstreamLocaleConfigSchema.parse(PT_BR_ROW);

		expect(row.scheduled).toBe(false);
	});

	test("filterScheduledLocales keeps only rows with scheduled: true", () => {
		const locales = [
			upstreamLocaleConfigSchema.parse({ ...PT_BR_ROW, scheduled: true }),
			upstreamLocaleConfigSchema.parse({ ...PT_BR_ROW, lang: "ru", scheduled: false }),
			upstreamLocaleConfigSchema.parse({ ...PT_BR_ROW, lang: "ja" }),
		];

		const scheduled = filterScheduledLocales(locales);

		expect(scheduled.map((row) => row.lang)).toEqual(["pt-br"]);
	});

	test("rejects a non-boolean scheduled value", () => {
		expect(() => upstreamLocaleConfigSchema.parse({ ...PT_BR_ROW, scheduled: "true" })).toThrow();
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
