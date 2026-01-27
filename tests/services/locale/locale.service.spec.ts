import { beforeEach, describe, expect, test } from "bun:test";

import { ptBrLocale } from "@/locales";
import { LocaleService } from "@/services/";

describe("LocaleService", () => {
	let localeService: LocaleService;

	beforeEach(() => {
		localeService = new LocaleService();
	});

	describe("Constructor", () => {
		test("should create instance with specified language code", () => {
			const service = new LocaleService("pt-br");

			expect(service).toBeInstanceOf(LocaleService);
			expect(service.languageCode).toBe("pt-br");
		});

		test("should load correct locale definition when language is registered", () => {
			const service = new LocaleService("pt-br");

			expect(service.definitions).toBe(ptBrLocale);
		});

		test("should fallback to pt-br when language is not registered", () => {
			const service = new LocaleService("ru");

			expect(service.definitions).toBe(ptBrLocale);
		});
	});

	describe("locale property", () => {
		describe("comment", () => {
			test("should have prefix property with translated text", () => {
				const service = new LocaleService("pt-br");

				expect(service.definitions.comment.prefix).toBe(
					"As seguintes páginas foram traduzidas e PRs foram criados:",
				);
			});

			test("should have suffix function that generates observations", () => {
				const service = new LocaleService("pt-br");
				const suffix = service.definitions.comment.suffix;

				expect(suffix).toContain("###### Observações");
			});
		});

		describe("rules", () => {
			test("should have specific rules for the locale", () => {
				const service = new LocaleService("pt-br");

				expect(service.definitions.rules.specific).toContain("PORTUGUESE (BRAZIL) SPECIFIC RULES");
			});

			test("should include deprecated translation rule", () => {
				const service = new LocaleService("pt-br");

				expect(service.definitions.rules.specific).toContain("deprecated");
				expect(service.definitions.rules.specific).toContain("descontinuado");
			});

			test("should include MDN URL localization rule", () => {
				const service = new LocaleService("pt-br");

				expect(service.definitions.rules.specific).toContain("developer.mozilla.org");
				expect(service.definitions.rules.specific).toContain("pt-BR");
			});
		});
	});
});
