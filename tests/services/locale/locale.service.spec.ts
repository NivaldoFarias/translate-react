import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ptBrLocale } from "@/locales";
import { LocaleService } from "@/services/";

describe("LocaleService", () => {
	beforeEach(() => {
		LocaleService.clearInstances();
	});

	afterEach(() => {
		LocaleService.clearInstances();
	});

	describe("Constructor", () => {
		test("should create instance with specified language code", () => {
			const service = new LocaleService("pt-br");

			expect(service).toBeInstanceOf(LocaleService);
			expect(service.languageCode).toBe("pt-br");
		});

		test("should load correct locale definition when language is registered", () => {
			const service = new LocaleService("pt-br");

			expect(service.locale).toBe(ptBrLocale);
		});

		test("should fallback to pt-br when language is not registered", () => {
			const service = new LocaleService("ru");

			expect(service.locale).toBe(ptBrLocale);
		});
	});

	describe("get", () => {
		test("should return singleton instance for current target language", () => {
			const instance1 = LocaleService.get();
			const instance2 = LocaleService.get();

			expect(instance1).toBe(instance2);
		});

		test("should use pt-br locale based on test environment", () => {
			const service = LocaleService.get();

			expect(service.locale.comment.prefix).toContain("traduzidas");
		});
	});

	describe("clearInstances", () => {
		test("should clear cached instances when called", () => {
			const instance1 = LocaleService.get();
			LocaleService.clearInstances();
			const instance2 = LocaleService.get();

			expect(instance1).not.toBe(instance2);
		});
	});

	describe("hasLocale", () => {
		test("should return true when locale exists for language code", () => {
			expect(LocaleService.hasLocale("pt-br")).toBe(true);
		});

		test("should return false when locale does not exist for language code", () => {
			expect(LocaleService.hasLocale("ru")).toBe(false);
		});
	});

	describe("getAvailableLocales", () => {
		test("should return array of registered language codes", () => {
			const locales = LocaleService.getAvailableLocales();

			expect(locales).toBeArray();
			expect(locales).toContain("pt-br");
		});

		test("should not include unregistered language codes", () => {
			const locales = LocaleService.getAvailableLocales();

			expect(locales).not.toContain("ru");
			expect(locales).not.toContain("en");
		});
	});

	describe("locale property", () => {
		describe("comment", () => {
			test("should have prefix property with translated text", () => {
				const service = new LocaleService("pt-br");

				expect(service.locale.comment.prefix).toBe(
					"As seguintes páginas foram traduzidas e PRs foram criados:",
				);
			});

			test("should have suffix function that generates observations", () => {
				const service = new LocaleService("pt-br");
				const suffix = service.locale.comment.suffix("test-owner");

				expect(suffix).toContain("###### Observações");
				expect(suffix).toContain("test-owner");
				expect(suffix).toContain("translate-react");
			});
		});

		describe("rules", () => {
			test("should have specific rules for the locale", () => {
				const service = new LocaleService("pt-br");

				expect(service.locale.rules.specific).toContain("PORTUGUESE (BRAZIL) SPECIFIC RULES");
			});

			test("should include deprecated translation rule", () => {
				const service = new LocaleService("pt-br");

				expect(service.locale.rules.specific).toContain("deprecated");
				expect(service.locale.rules.specific).toContain("descontinuado");
			});

			test("should include MDN URL localization rule", () => {
				const service = new LocaleService("pt-br");

				expect(service.locale.rules.specific).toContain("developer.mozilla.org");
				expect(service.locale.rules.specific).toContain("pt-BR");
			});
		});
	});
});
