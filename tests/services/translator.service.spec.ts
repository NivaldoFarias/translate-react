import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { LanguageDetectorService, TranslatorServiceDependencies } from "@/services/";

import type { MockLanguageDetectorService } from "@tests/mocks";

import { localeService, TranslatorService } from "@/services/";

import {
	createChatCompletionFixture,
	createLanguageAnalysisResultFixture,
	createOpenAIApiErrorFixture,
	createTranslationFileFixture,
} from "@tests/fixtures";
import {
	createChatCompletionsMock,
	createMockLanguageDetectorService,
	createMockOpenAI,
	createMockQueue,
} from "@tests/mocks";

/** Module-scoped mock for chat completions (can be spied/cleared per test) */
const mockChatCompletionsCreate = createChatCompletionsMock();

/** Creates test TranslatorService with optional overrides */
function createTestTranslatorService(
	overrides: Partial<TranslatorServiceDependencies> = {},
): TranslatorService {
	return new TranslatorService({
		openai: overrides.openai ?? createMockOpenAI(mockChatCompletionsCreate),
		model: overrides.model ?? "test-model",
		localeService: overrides.localeService ?? localeService,
		languageDetectorService:
			overrides.languageDetectorService ?? createMockLanguageDetectorService(),
		queue: overrides.queue ?? createMockQueue(),
		retryConfig: {
			retries: overrides.retryConfig?.retries ?? 0,
			factor: overrides.retryConfig?.factor ?? 1,
			minTimeout: overrides.retryConfig?.minTimeout ?? 100,
			maxTimeout: overrides.retryConfig?.maxTimeout ?? 1000,
			randomize: overrides.retryConfig?.randomize ?? false,
		},
	} as TranslatorServiceDependencies);
}

describe("TranslatorService", () => {
	let translatorService: TranslatorService;

	beforeEach(() => {
		mockChatCompletionsCreate.mockClear();
		translatorService = createTestTranslatorService();
	});

	describe("Constructor", () => {
		test("should initialize with valid language configuration", () => {
			expect(translatorService).toBeInstanceOf(TranslatorService);
			expect(translatorService.glossary).toBeNull();
		});

		test("should initialize language detector with provided config", () => {
			const translatorService = createTestTranslatorService();

			expect(translatorService).toBeInstanceOf(TranslatorService);
			expect(translatorService.services.languageDetector).toBeDefined();
		});
	});

	describe("TranslationFile", () => {
		test("should extract title from frontmatter when title is present", () => {
			const content = `
			---
			title: 'Hello'
			---
			# Hello
	
			Welcome to React!
			`;
			const file = createTranslationFileFixture({ content });
			expect(file.title).toBe("Hello");
		});

		test("should extract title from frontmatter when title is present with double quotes", () => {
			const content = `
			---
			title: "Hello"
			---
			# Hello
			`;
			const file = createTranslationFileFixture({ content });
			expect(file.title).toBe("Hello");
		});

		test("should not extract title from frontmatter when title is not present", () => {
			const content = `
			# Hello
			Welcome to React!
			`;
			const file = createTranslationFileFixture({ content });
			expect(file.title).toBeUndefined();
		});
	});

	describe("testConnectivity", () => {
		test("resolves when LLM returns valid response", async () => {
			mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture());

			await translatorService.testConnectivity();

			expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
		});

		test("throws ApplicationError when LLM response has no id, usage, or choices", () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					id: undefined,
					created: 0,
					model: "test",
					choices: [],
					usage: undefined,
				}),
			);

			expect(translatorService.testConnectivity()).rejects.toThrow("Invalid LLM API response");
		});
	});

	describe("getLanguageAnalysis", () => {
		test("returns language analysis when file has content", async () => {
			const expectedAnalysis = createLanguageAnalysisResultFixture();
			spyOn(translatorService.services.languageDetector, "analyzeLanguage").mockResolvedValue(
				expectedAnalysis,
			);

			const file = createTranslationFileFixture({ content: "Conteúdo em português." });

			const analysis = await translatorService.getLanguageAnalysis(file);

			expect(analysis).toBe(expectedAnalysis);
			expect(
				spyOn(translatorService.services.languageDetector, "analyzeLanguage"),
			).toHaveBeenCalledWith(file.filename, file.content);
		});

		test("throws ApplicationError when file content is empty", () => {
			const file = createTranslationFileFixture({ content: "" });

			expect(translatorService.getLanguageAnalysis(file)).rejects.toThrow("File content is empty");
		});
	});

	describe("translateContent", () => {
		test("should translate content successfully when valid content is provided", async () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: "Olá mundo" } }] }),
			);

			const file = createTranslationFileFixture({ content: "Hello world" });

			const translation = await translatorService.translateContent(file);

			expect(translation).toBe("Olá mundo");
			expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
		});

		test("should throw error when content is empty", () => {
			const file = createTranslationFileFixture({ content: "" });

			expect(translatorService.translateContent(file)).rejects.toThrow("File content is empty");
		});

		test("should throw error when content is whitespace-only", () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: "   \n\t  \n  " } }] }),
			);

			const file = createTranslationFileFixture({ content: "   \n\t  \n  " });

			expect(translatorService.translateContent(file)).rejects.toThrow(
				"Translation produced empty content",
			);
		});

		test("should preserve code blocks in translated content", async () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [
						{
							message: {
								content: `# Título\n\`\`\`javascript\n// Comentário traduzido\nconst example = "test";\n\`\`\`\n\nTexto traduzido`,
							},
						},
					],
				}),
			);

			const file = createTranslationFileFixture({
				content: `# Title\n\`\`\`javascript\n// Comment\nconst example = "test";\n\`\`\`\n\nText`,
			});

			const translation = await translatorService.translateContent(file);

			expect(translation).toContain("Título");
			expect(translation).toContain("Comentário traduzido");
			expect(translation).toContain('const example = "test"');
			expect(translation).toContain("```javascript");
		});

		test("should handle API errors gracefully", () => {
			const apiError = createOpenAIApiErrorFixture({
				error: { message: "API Error" },
				message: "API Error",
			});
			mockChatCompletionsCreate.mockRejectedValue(apiError);

			const file = createTranslationFileFixture({ content: "Error test content" });

			expect(translatorService.translateContent(file)).rejects.toThrow(apiError);
		});

		test("should handle large content with chunking", async () => {
			const largeContent = "Large content ".repeat(1000);
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [{ message: { content: "Conteúdo grande traduzido" } }],
				}),
			);

			const file = createTranslationFileFixture({ content: largeContent });

			const translation = await translatorService.translateContent(file);

			expect(translation).toBeDefined();
			expect(typeof translation).toBe("string");
		});
	});

	describe("isFileTranslated", () => {
		test("should detect English content as not translated", async () => {
			spyOn(translatorService.services.languageDetector, "analyzeLanguage").mockResolvedValue(
				createLanguageAnalysisResultFixture({ isTranslated: false }),
			);

			const file = createTranslationFileFixture({
				content: "This is English content that needs translation.",
			});

			const isTranslated = await translatorService.isContentTranslated(file);

			expect(isTranslated).toBe(false);
		});

		test("should detect Portuguese content as translated", async () => {
			spyOn(translatorService.services.languageDetector, "analyzeLanguage").mockResolvedValue(
				createLanguageAnalysisResultFixture(),
			);

			const file = createTranslationFileFixture({
				content: "Este é um conteúdo em português que já foi traduzido.",
			});

			const isTranslated = await translatorService.isContentTranslated(file);

			expect(isTranslated).toBe(true);
		});

		test("should handle mixed language content", async () => {
			const file = createTranslationFileFixture({
				content: "This has some English and também algum português.",
			});

			const isTranslated = await translatorService.isContentTranslated(file);

			expect(typeof isTranslated).toBe("boolean");
		});
	});

	describe("Edge Cases", () => {
		test("should handle malformed markdown content", async () => {
			const malformedContent = "# Incomplete header\n```\nUnclosed code block\n## Another header";
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [
						{
							message: {
								content:
									"# Cabeçalho incompleto\n```\nBloco de código não fechado\n## Outro cabeçalho",
							},
						},
					],
				}),
			);

			const file = createTranslationFileFixture({ content: malformedContent });

			const translation = await translatorService.translateContent(file);

			expect(translation).toBeDefined();
			expect(typeof translation).toBe("string");
		});

		test("should handle special characters and emojis", async () => {
			const contentWithEmojis = "Hello world! 🌍 This has special chars: àáâãäåæçèéêë";
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [
						{ message: { content: "Olá mundo! 🌍 Isto tem caracteres especiais: àáâãäåæçèéêë" } },
					],
				}),
			);

			const file = createTranslationFileFixture({ content: contentWithEmojis });

			const translation = await translatorService.translateContent(file);

			expect(translation).toContain("🌍");
			expect(translation).toContain("àáâãäåæçèéêë");
		});

		test("should handle glossary integration", () => {
			const glossary = "React - React\ncomponent - componente\nprops - propriedades";

			translatorService.glossary = glossary;

			expect(translatorService.glossary).toBe(glossary);
		});

		test("should handle null response from API", () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [{ message: { content: null } }],
				}),
			);

			const file = createTranslationFileFixture({ content: "Test content" });

			expect(translatorService.translateContent(file)).rejects.toThrow();
		});

		test("should handle undefined response from API", () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [{ message: {} }],
				}),
			);

			const file = createTranslationFileFixture({ content: "Test content" });

			expect(translatorService.translateContent(file)).rejects.toThrow();
		});

		test("should handle empty choices array from API", () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [],
				}),
			);

			const file = createTranslationFileFixture({ content: "Test content" });

			expect(translatorService.translateContent(file)).rejects.toThrow();
		});

		test("should return false for invalid LLM response", () => {
			const invalidResponse = createChatCompletionFixture({
				id: undefined,
				usage: undefined,
				// @ts-expect-error - invalid `message` type for testing
				choices: [{ message: null }],
			});

			// @ts-expect-error - call to a private method
			const isValid = translatorService.isLLMResponseValid(invalidResponse);

			expect(isValid).toBe(false);
		});
	});
});
