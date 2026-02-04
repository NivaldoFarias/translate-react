import { beforeEach, describe, expect, test } from "bun:test";

import type { PullRequestDescriptionMetadata } from "@/services";

import { ptBrLocale, ruLocale } from "@/locales";
import { LocaleService, TranslationFile } from "@/services/";

import { createProcessedFileResultsFixture } from "@tests/fixtures";

function createPullRequestDescriptionMetadata(
	overrides?: Partial<PullRequestDescriptionMetadata>,
): PullRequestDescriptionMetadata {
	return {
		languageName: "Português (Brasil)",
		invalidFilePR: undefined,
		content: {
			source: "1.5 kB",
			translation: "1.8 kB",
			compressionRatio: "1.20",
		},
		timestamps: {
			now: 1706900000000,
			workflowStart: 1706899000000,
		},
		...overrides,
	};
}

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

		test("returns true for Russian locale", () => {
			expect(localeService.hasLocale("ru")).toBe(true);
		});

		test("returns false when language code is not registered", () => {
			// @ts-expect-error - testing invalid language code
			expect(localeService.hasLocale("es")).toBe(false);
		});
	});

	describe("getAvailableLocales", () => {
		test("returns array of registered language codes", () => {
			const locales = localeService.getAvailableLocales();

			expect(locales).toContain("pt-br");
			expect(locales).toContain("ru");
			expect(Array.isArray(locales)).toBe(true);
		});

		test("returns array that does not include unregistered language codes", () => {
			const locales = localeService.getAvailableLocales();

			expect(locales).not.toContain("es");
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

describe("ptBrLocale.pullRequest.body", () => {
	const buildPullRequestBody = ptBrLocale.pullRequest.body;

	const file = new TranslationFile(
		"# Test Content\n\nSome markdown content.",
		"test-file.md",
		"src/content/test-file.md",
		"abc123sha",
	);

	const [processingResult] = createProcessedFileResultsFixture({ count: 1 });

	if (!processingResult) throw new Error("Failed to create processing result");

	describe("conflict notice generation", () => {
		test("should not include conflict notice when invalidFilePR is undefined", () => {
			const metadata = createPullRequestDescriptionMetadata({
				invalidFilePR: undefined,
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).not.toContain("[!IMPORTANT]\n> **PR anterior fechado**");
			expect(body).not.toContain("fechado automaticamente");
		});

		test("should include conflict notice with PR number when invalidFilePR exists", () => {
			const metadata = createPullRequestDescriptionMetadata({
				invalidFilePR: {
					prNumber: 42,
					status: {
						needsUpdate: true,
						hasConflicts: true,
						mergeable: false,
						mergeableState: "dirty",
					},
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("> [!IMPORTANT]");
			expect(body).toContain("**PR anterior fechado**");
			expect(body).toContain("#42");
			expect(body).toContain("fechado automaticamente");
		});

		test("should include mergeable state in conflict notice", () => {
			const metadata = createPullRequestDescriptionMetadata({
				invalidFilePR: {
					prNumber: 99,
					status: {
						needsUpdate: true,
						hasConflicts: true,
						mergeable: false,
						mergeableState: "dirty",
					},
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("mergeable_state: dirty");
		});

		test("should explain complete rewrite approach in conflict notice", () => {
			const metadata = createPullRequestDescriptionMetadata({
				invalidFilePR: {
					prNumber: 123,
					status: {
						needsUpdate: true,
						hasConflicts: true,
						mergeable: false,
						mergeableState: "dirty",
					},
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("tradução completamente nova");
			expect(body).toContain("versão mais atual");
		});

		test("should use GFM IMPORTANT alert syntax for conflict notice", () => {
			const metadata = createPullRequestDescriptionMetadata({
				invalidFilePR: {
					prNumber: 1,
					status: {
						needsUpdate: true,
						hasConflicts: true,
						mergeable: false,
						mergeableState: "dirty",
					},
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("> [!IMPORTANT]");
			expect(body).not.toContain("> [!WARNING]");
		});
	});

	describe("PR body structure", () => {
		test("should include language name in PR body", () => {
			const metadata = createPullRequestDescriptionMetadata();

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("Português (Brasil)");
		});

		test("should include processing statistics in details section", () => {
			const metadata = createPullRequestDescriptionMetadata({
				content: {
					source: "2.5 kB",
					translation: "3.0 kB",
					compressionRatio: "1.20",
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("2.5 kB");
			expect(body).toContain("3.0 kB");
			expect(body).toContain("1.20x");
		});

		test("should include human review notice", () => {
			const metadata = createPullRequestDescriptionMetadata();

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("requer revisão humana");
		});
	});
});

describe("ruLocale.pullRequest.body", () => {
	const buildPullRequestBody = ruLocale.pullRequest.body;

	const file = new TranslationFile(
		"# Test Content\n\nSome markdown content.",
		"test-file.md",
		"src/content/test-file.md",
		"abc123sha",
	);

	const [processingResult] = createProcessedFileResultsFixture({ count: 1 });

	if (!processingResult) throw new Error("Failed to create processing result");

	describe("conflict notice generation", () => {
		test("should not include conflict notice when invalidFilePR is undefined", () => {
			const metadata = createPullRequestDescriptionMetadata({
				languageName: "Русский",
				invalidFilePR: undefined,
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).not.toContain("Предыдущий PR закрыт");
			expect(body).not.toContain("автоматически закрыт");
		});

		test("should include conflict notice with PR number when invalidFilePR exists", () => {
			const metadata = createPullRequestDescriptionMetadata({
				languageName: "Русский",
				invalidFilePR: {
					prNumber: 42,
					status: {
						needsUpdate: true,
						hasConflicts: true,
						mergeable: false,
						mergeableState: "dirty",
					},
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("> [!IMPORTANT]");
			expect(body).toContain("**Предыдущий PR закрыт**");
			expect(body).toContain("#42");
			expect(body).toContain("автоматически закрыт");
		});
	});

	describe("PR body structure", () => {
		test("should include language name in PR body", () => {
			const metadata = createPullRequestDescriptionMetadata({
				languageName: "Русский",
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("Русский");
		});

		test("should include human review notice in Russian", () => {
			const metadata = createPullRequestDescriptionMetadata({
				languageName: "Русский",
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("требует проверки человеком");
		});

		test("should include Russian section headers", () => {
			const metadata = createPullRequestDescriptionMetadata({
				languageName: "Русский",
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("Статистика обработки");
			expect(body).toContain("Техническая информация");
		});
	});
});
