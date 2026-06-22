import { beforeEach, describe, expect, test } from "bun:test";

import type { PullRequestDescriptionMetadata } from "@/app/locales/types";

import { WIKI_FOR_REACT_DOCS_MAINTAINERS_URL } from "@/app/constants";
import { ptBrLocale, ruLocale } from "@/app/locales";
import { LocaleService } from "@/app/services/locale/locale.service";
import { TranslationFile } from "@/app/services/translator/translation-file";
import { buildRunnerReleaseUrl } from "@/app/utils/common.util";
import { ApplicationError } from "@/shared/errors/";

import { createProcessedFileResultsFixture } from "@tests/fixtures";

function createPullRequestDescriptionMetadata(
	overrides?: Partial<PullRequestDescriptionMetadata>,
): PullRequestDescriptionMetadata {
	return {
		languageName: "Português (Brasil)",
		invalidFilePR: undefined,
		reviewerNotices: [],
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

		test("throws when language is not registered", () => {
			expect(() => {
				// @ts-expect-error - exercising unregistered locale code
				new LocaleService("es");
			}).toThrow(ApplicationError);
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
			test("should build fallback prefix without workflow run context", () => {
				expect(localeService.definitions.comment.prefix()).toBe(
					"As seguintes páginas foram traduzidas nesta execução:",
				);
			});

			test("should build CI prefix with workflow run and release tag links", () => {
				const workflowRunUrl = "https://github.com/o/r/actions/runs/1";
				const prefix = localeService.definitions.comment.prefix({
					version: "v0.1.28",
					releaseUrl: buildRunnerReleaseUrl("v0.1.28"),
					workflowName: "Run Translation Workflow",
					runId: "1",
					url: workflowRunUrl,
				});

				expect(prefix).toContain(`[última execução](${workflowRunUrl})`);
				expect(prefix).toContain("[`translate-react@v0.1.28`]");
				expect(prefix).toContain(buildRunnerReleaseUrl("v0.1.28"));
			});

			test("should have suffix function that generates observations", () => {
				const suffix = localeService.definitions.comment.suffix;

				expect(suffix).toContain("[^1]:");
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

			test("should include fenced code and MDX rules for pt-br", () => {
				expect(localeService.definitions.rules.specific).toContain("FENCED CODE AND MDX");
				expect(localeService.definitions.rules.specific).toContain("ConsoleLogLine");
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

			expect(body).not.toContain("PR anterior fechado");
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
						createdBy: "other-user",
					},
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("> [!NOTE]");
			expect(body).toContain("**PR anterior fechado**");
			expect(body).toContain("#42");
			expect(body).toContain("fechado automaticamente");
		});

		test("should note rewrite from current source in conflict notice", () => {
			const metadata = createPullRequestDescriptionMetadata({
				invalidFilePR: {
					prNumber: 123,
					status: {
						needsUpdate: true,
						hasConflicts: true,
						mergeable: false,
						mergeableState: "dirty",
						createdBy: "other-user",
					},
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("refeita a partir do arquivo fonte atual");
			expect(body).toContain("sem merge manual dos conflitos");
		});
	});

	describe("PR body structure", () => {
		test("should not include collapsible details when there are no reviewer notices", () => {
			const body = buildPullRequestBody(
				file,
				processingResult,
				createPullRequestDescriptionMetadata(),
			);

			expect(body).not.toContain("<details>");
			expect(body).not.toContain("Estatísticas de Processamento");
			expect(body).not.toContain("Informações Técnicas");
			expect(body).not.toContain("Versão do translate-react");
		});

		test("should include human review notice and maintainer wiki tip", () => {
			const metadata = createPullRequestDescriptionMetadata();

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("requer revisão humana");
			expect(body).toContain("> [!TIP]");
			expect(body).toContain(WIKI_FOR_REACT_DOCS_MAINTAINERS_URL);
			expect(body).not.toContain("> [!IMPORTANT]");
			expect(body).not.toContain("Este PR contém");
		});

		test("should render validation intro and grouped details when reviewer notices exist", () => {
			const metadata = createPullRequestDescriptionMetadata({
				reviewerNotices: [
					{
						guardId: "markdownLinksPreserved",
						hint: "Preserve every `[label](url)` from the source.",
					},
				],
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("A validação automática detectou problemas mecânicos");
			expect(body).not.toContain("> [!WARNING]");
			expect(body).toContain("> [!TIP]");
			expect(body).toContain(WIKI_FOR_REACT_DOCS_MAINTAINERS_URL);
			expect(body).toContain("<details>");
			expect(body).toContain("Ver detalhes da validação");
			expect(body).toContain("### Links markdown");
			expect(body).toContain("#### `markdownLinksPreserved` (1 violação)");
			expect(body).toContain("> Preserve every");
			expect(body).not.toContain("| Validador | O que corrigir |");
			expect(body).not.toContain("Guia para revisores:");
			expect(body).not.toContain("Tentativas de Validação");
		});

		test("should format JSX fence violations as diff blocks when source and translation are available", () => {
			const sourceFile = new TranslationFile(
				["# Demo", "", "```js", "return <div>animate me</div>;", "```"].join("\n"),
				"demo.md",
				"src/content/demo.md",
				"sha-demo",
			);
			const translated = sourceFile.content.replace("<div>animate me</div>", "<div>anime-me</div>");
			const result = {
				...processingResult,
				translation: translated,
			};
			const metadata = createPullRequestDescriptionMetadata({
				reviewerNotices: [
					{
						guardId: "fenceJsxStaticText",
						hint: 'Inside fenced code blocks, do not translate JSX text between tags or demo UI string literals used in examples. Copy static JSX text exactly from the source in English. fence 1: keep JSX text "<div>animate me" (changed to "<div>anime-me")',
					},
				],
			});

			const body = buildPullRequestBody(sourceFile, result, metadata);

			expect(body).toContain("### Texto JSX estático em blocos de código");
			expect(body).toContain("#### `fenceJsxStaticText` (1 violação)");
			expect(body).toContain("> Inside fenced code blocks");
			expect(body).toContain("#### L");
			expect(body).toContain("```diff");
			expect(body).toContain("- animate me");
			expect(body).toContain("+ anime-me");
			expect(body).not.toContain("\\n");
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
			expect(body).not.toContain("закрыт автоматически");
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
						createdBy: "other-user",
					},
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("> [!NOTE]");
			expect(body).toContain("**Предыдущий PR закрыт**");
			expect(body).toContain("#42");
			expect(body).toContain("закрыт автоматически");
		});
	});

	describe("PR body structure", () => {
		test("should include human review notice and maintainer wiki tip in Russian", () => {
			const metadata = createPullRequestDescriptionMetadata({
				languageName: "Русский",
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("требует проверки человеком");
			expect(body).toContain("> [!TIP]");
			expect(body).not.toContain("> [!IMPORTANT]");
			expect(body).not.toContain("Этот PR содержит");
		});

		test("should not include removed stats or tech sections", () => {
			const metadata = createPullRequestDescriptionMetadata({
				languageName: "Русский",
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).not.toContain("Статистика обработки");
			expect(body).not.toContain("Техническая информация");
		});
	});
});
