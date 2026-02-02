import { beforeEach, describe, expect, test } from "bun:test";

import { ptBrLocale } from "@/locales";
import { LocaleService } from "@/services/";

describe("LocaleService", () => {
	let localeService: LocaleService;

	beforeEach(() => {
		localeService = new LocaleService("pt-br");
	});

	describe("Constructor", () => {
		test("should create instance with specified language code", () => {
			expect(localeService).toBeInstanceOf(LocaleService);
			expect(localeService.languageCode).toBe("pt-br");
		});

		test("should load correct locale definition when language is registered", () => {
			expect(localeService.definitions).toBe(ptBrLocale);
		});

		test("should fallback to pt-br when language is not registered", () => {
			expect(localeService.definitions).toBe(ptBrLocale);
		});
	});

	describe("hasLocale", () => {
		test("returns true when language code is registered", () => {
			expect(localeService.hasLocale("pt-br")).toBe(true);
		});

		test("returns false when language code is not registered", () => {
			expect(localeService.hasLocale("ru")).toBe(false);
		});
	});

	describe("getAvailableLocales", () => {
		test("returns array of registered language codes", () => {
			const locales = localeService.getAvailableLocales();

			expect(locales).toContain("pt-br");
			expect(Array.isArray(locales)).toBe(true);
		});

		test("returns array that does not include unregistered language codes", () => {
			const locales = localeService.getAvailableLocales();

			expect(locales).not.toContain("ru");
			expect(locales).not.toContain("en");
		});
	});

	describe("locale property", () => {
		describe("comment", () => {
			test("should have prefix property with translated text", () => {
				expect(localeService.definitions.comment.prefix).toBe(
					"As seguintes páginas foram traduzidas e PRs foram criados:",
				);
			});

			test("should have suffix function that generates observations", () => {
				const suffix = localeService.definitions.comment.suffix;

				expect(suffix).toContain("> [!IMPORTANT]");
			});
		});

		describe("rules", () => {
			test("should have specific rules for the locale", () => {
				expect(localeService.definitions.rules.specific).toContain(
					"PORTUGUESE (BRAZIL) SPECIFIC RULES",
				);
			});

			test("should include deprecated translation rule", () => {
				expect(localeService.definitions.rules.specific).toContain("deprecated");
				expect(localeService.definitions.rules.specific).toContain("descontinuado");
			});

			test("should include MDN URL localization rule", () => {
				expect(localeService.definitions.rules.specific).toContain("developer.mozilla.org");
				expect(localeService.definitions.rules.specific).toContain("pt-BR");
			});
		});
	});
});
