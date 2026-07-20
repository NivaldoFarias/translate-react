import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { LocaleService } from "@/app/locales/locale.service";
import { LOCALE_MODULE_REQUIRED_RELATIVE_FILES } from "@/app/locales/module-layout.constants";
import { getAvailableLocales } from "@/app/locales/registry";
import {
	LOCALE_MECHANICAL_REPAIRS_HANDLES,
	LOCALE_MECHANICAL_REPAIRS_REGISTRY,
} from "@/app/locales/repairs/registry";
import { segmentBatchContextSection } from "@/app/locales/rules.util";

const LOCALES_ROOT = join(import.meta.dir, "../../../src/app/locales");

describe("locale module layout", () => {
	const registeredLocales = getAvailableLocales();

	test("every registered locale has the required module files", () => {
		for (const localeId of registeredLocales) {
			for (const relativePath of LOCALE_MODULE_REQUIRED_RELATIVE_FILES) {
				expect(existsSync(join(LOCALES_ROOT, localeId, relativePath))).toBe(true);
			}
		}
	});

	test("locale.ts wires rules from rules.ts only", () => {
		for (const localeId of registeredLocales) {
			const localeSource = readFileSync(join(LOCALES_ROOT, localeId, "locale.ts"), "utf8");

			expect(localeSource.includes('from "./rules"')).toBe(true);
			expect(localeSource.includes("buildLocaleRulesPrompt")).toBe(false);
			expect(localeSource.includes("LocalePromptRuleSection")).toBe(false);
		}
	});

	test("segment-specific rules include shared segment batch context", () => {
		for (const localeId of registeredLocales) {
			const segmentRules = new LocaleService(localeId).definitions.rules.segmentSpecific;

			expect(segmentRules).toBeDefined();
			expect(segmentRules).toContain(segmentBatchContextSection.heading);
			expect(segmentRules).toContain(segmentBatchContextSection.bullets[0]);
		}
	});

	test("mechanical repair handles are registered for every locale", () => {
		expect(new Set(Object.keys(LOCALE_MECHANICAL_REPAIRS_HANDLES))).toEqual(
			new Set(registeredLocales),
		);
		expect(new Set(Object.keys(LOCALE_MECHANICAL_REPAIRS_REGISTRY))).toEqual(
			new Set(registeredLocales),
		);
	});

	test("each mechanical repair definition localeId matches its module folder", () => {
		for (const [localeId, handle] of Object.entries(LOCALE_MECHANICAL_REPAIRS_HANDLES)) {
			expect(handle.definition.localeId).toBe(localeId);
		}
	});
});
