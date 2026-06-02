import { beforeEach, describe, expect, test } from "bun:test";

import type { PullRequestDescriptionMetadata } from "@/app/locales/types";

import { WIKI_FOR_REACT_DOCS_MAINTAINERS_URL } from "@/app/constants";
import { ptBrLocale, ruLocale } from "@/app/locales";
import { LocaleService } from "@/app/services/locale/locale.service";
import { TranslationFile } from "@/app/services/translator/translation-file";
import { buildRunnerReleaseUrl } from "@/app/utils/common.util";

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
		runnerVersion: "v0.1.28",
		translationModel: "google/gemini-2.0-flash-exp:free",
		llmApiHost: "openrouter.ai",
		nodeEnv: "test",
		maskVerbatimLargeFences: false,
		retries: [],
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
			test("should build fallback prefix without workflow run context", () => {
				expect(localeService.definitions.comment.prefix()).toBe(
					"As seguintes páginas foram traduzidas e PRs foram criados:",
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
						createdBy: "other-user",
					},
				},
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("> [!IMPORTANT]");
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

		test("should use GFM IMPORTANT alert syntax for conflict notice", () => {
			const metadata = createPullRequestDescriptionMetadata({
				invalidFilePR: {
					prNumber: 1,
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

		test("should include translation model under technical info", () => {
			const metadata = createPullRequestDescriptionMetadata({
				translationModel: "anthropic/claude-3.5-sonnet",
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("Modelo de tradução (LLM)");
			expect(body).toContain("`anthropic/claude-3.5-sonnet`");
		});

		test("should include runner version and runtime config under technical info", () => {
			const metadata = createPullRequestDescriptionMetadata({
				runnerVersion: "v0.2.0",
				llmApiHost: "openrouter.ai",
				nodeEnv: "production",
			});

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("Versão do translate-react");
			expect(body).toContain("`v0.2.0`");
			expect(body).toContain("`openrouter.ai`");
			expect(body).toContain("`production`");
		});

		test("should list mask verbatim fences only when enabled", () => {
			const enabled = buildPullRequestBody(
				file,
				processingResult,
				createPullRequestDescriptionMetadata({ maskVerbatimLargeFences: true }),
			);
			const disabled = buildPullRequestBody(
				file,
				processingResult,
				createPullRequestDescriptionMetadata({ maskVerbatimLargeFences: false }),
			);

			expect(enabled).toContain("Máscara de blocos de código grandes");
			expect(disabled).not.toContain("Máscara de blocos de código grandes");
		});

		test("should use footnotes for content ratio and processing time metrics", () => {
			const metadata = createPullRequestDescriptionMetadata();

			const body = buildPullRequestBody(file, processingResult, metadata);

			expect(body).toContain("1.20x [^content-ratio]");
			expect(body).toContain("[^processing-time]");
			expect(body).toContain("[^content-ratio]:");
			expect(body).toContain("[^processing-time]:");
			expect(body).not.toContain("> [!NOTE]");
			expect(body).toContain("Razão de Conteúdo");
		});

		test("should link to the maintainer wiki guide", () => {
			const body = buildPullRequestBody(
				file,
				processingResult,
				createPullRequestDescriptionMetadata(),
			);

			expect(body).toContain(WIKI_FOR_REACT_DOCS_MAINTAINERS_URL);
			expect(body).not.toContain("> [!TIP]");
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

			expect(body).toContain("> [!IMPORTANT]");
			expect(body).toContain("**Предыдущий PR закрыт**");
			expect(body).toContain("#42");
			expect(body).toContain("закрыт автоматически");
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
			expect(body).toContain("Модель перевода (LLM)");
		});
	});
});
