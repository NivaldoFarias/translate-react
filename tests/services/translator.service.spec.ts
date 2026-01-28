import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { ChatCompletion } from "openai/resources";

import type { TranslatorServiceDependencies } from "@/services/";

import { localeService, TranslationFile, TranslatorService } from "@/services/";

import {
	createChatCompletionsMock,
	createMockChatCompletion,
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
	const defaults = {
		openai: createMockOpenAI(mockChatCompletionsCreate),
		model: "test-model",
		localeService,
		languageDetectorService: createMockLanguageDetectorService(),
		queue: createMockQueue(),
		retryConfig: {
			retries: 0,
			factor: 1,
			minTimeout: 100,
			maxTimeout: 1000,
			randomize: false,
		},
	};

	return new TranslatorService({
		...(defaults as unknown as TranslatorServiceDependencies),
		...overrides,
	});
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

	describe("translateContent", () => {
		test("should translate content successfully when valid content is provided", async () => {
			mockChatCompletionsCreate.mockResolvedValue({
				id: "chatcmpl-123",
				created: 1_701_764_769,
				model: "gpt-4-0314",
				object: "chat.completion",
				choices: [
					{
						message: {
							content: "Olá mundo",
							refusal: null,
							role: "assistant",
						},
						finish_reason: "stop",
						index: 0,
						logprobs: null,
					},
				],
				usage: {
					total_tokens: 50,
					completion_tokens: 50,
					prompt_tokens: 0,
				},
			} as ChatCompletion);

			const file: TranslationFile = {
				path: "test/file.md",
				content: "Hello world",
				sha: "abc123",
				filename: "file.md",
			};

			const translation = await translatorService.translateContent(file);

			expect(translation).toBe("Olá mundo");
			expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
		});

		test("should throw error when content is empty", () => {
			const file: TranslationFile = {
				path: "test/empty.md",
				content: "",
				sha: "def456",
				filename: "empty.md",
			};

			expect(translatorService.translateContent(file)).rejects.toThrow("File content is empty");
		});

		test("should throw error when content is whitespace-only", () => {
			mockChatCompletionsCreate.mockResolvedValue({
				choices: [{ message: { content: "   \n\t  \n  " } }],
				usage: { total_tokens: 10 },
			} as ChatCompletion);

			const file: TranslationFile = {
				path: "test/whitespace.md",
				content: "   \n\t  \n  ",
				sha: "wht123",
				filename: "whitespace.md",
			};

			expect(translatorService.translateContent(file)).rejects.toThrow(
				"Translation produced empty content",
			);
		});

		test("should preserve code blocks in translated content", async () => {
			mockChatCompletionsCreate.mockResolvedValue({
				choices: [
					{
						message: {
							content: `# Título\n\`\`\`javascript\n// Comentário traduzido\nconst example = "test";\n\`\`\`\n\nTexto traduzido`,
						},
					},
				],
				usage: { total_tokens: 80 },
			} as ChatCompletion);

			const file: TranslationFile = {
				path: "test/code.md",
				content: `# Title\n\`\`\`javascript\n// Comment\nconst example = "test";\n\`\`\`\n\nText`,
				sha: "ghi789",
				filename: "code.md",
			};

			const translation = await translatorService.translateContent(file);

			expect(translation).toContain("Título");
			expect(translation).toContain("Comentário traduzido");
			expect(translation).toContain('const example = "test"');
			expect(translation).toContain("```javascript");
		});

		test("should handle API errors gracefully", () => {
			mockChatCompletionsCreate.mockRejectedValue(new Error("API Error"));

			const file: TranslationFile = {
				path: "test/error.md",
				content: "Error test content",
				sha: "mno345",
				filename: "error.md",
			};

			expect(translatorService.translateContent(file)).rejects.toThrow("API Error");
		});

		test("should handle large content with chunking", async () => {
			const largeContent = "Large content ".repeat(1000);
			mockChatCompletionsCreate.mockResolvedValue({
				choices: [{ message: { content: "Conteúdo grande traduzido" } }],
				usage: { total_tokens: 500 },
			} as ChatCompletion);

			const file: TranslationFile = {
				path: "test/large.md",
				content: largeContent,
				sha: "large123",
				filename: "large.md",
			};

			const translation = await translatorService.translateContent(file);

			expect(translation).toBeDefined();
			expect(typeof translation).toBe("string");
		});
	});

	describe("isFileTranslated", () => {
		test("should detect English content as not translated", async () => {
			const file: TranslationFile = new TranslationFile(
				"This is English content that needs translation.",
				"english.md",
				"docs/english.md",
				"eng123",
			);

			const isTranslated = await translatorService.isContentTranslated(file);

			expect(isTranslated).toBe(false);
		});

		test("should detect Portuguese content as translated", async () => {
			spyOn(translatorService.services.languageDetector, "analyzeLanguage").mockResolvedValue({
				languageScore: { target: 0.9, source: 0.1 },
				ratio: 0.9,
				isTranslated: true,
				detectedLanguage: "pt",
				rawResult: {
					reliable: true,
					textBytes: 1234,
					languages: [],
					chunks: [],
				},
			});

			const file: TranslationFile = new TranslationFile(
				"Este é um conteúdo em português que já foi traduzido.",
				"portuguese.md",
				"test/portuguese.md",
				"pt123",
			);

			const isTranslated = await translatorService.isContentTranslated(file);

			expect(isTranslated).toBe(true);
		});

		test("should handle mixed language content", async () => {
			const file: TranslationFile = new TranslationFile(
				"This has some English and também algum português.",
				"mixed.md",
				"test/mixed.md",
				"mix123",
			);

			const isTranslated = await translatorService.isContentTranslated(file);

			expect(typeof isTranslated).toBe("boolean");
		});
	});

	describe("Edge Cases and Error Handling", () => {
		test("should handle malformed markdown content", async () => {
			const malformedContent = "# Incomplete header\n```\nUnclosed code block\n## Another header";
			mockChatCompletionsCreate.mockResolvedValue({
				choices: [
					{
						message: {
							content:
								"# Cabeçalho incompleto\n```\nBloco de código não fechado\n## Outro cabeçalho",
						},
					},
				],
				usage: { total_tokens: 60 },
			} as ChatCompletion);

			const file: TranslationFile = {
				path: "test/malformed.md",
				content: malformedContent,
				sha: "mal123",
				filename: "malformed.md",
			};

			const translation = await translatorService.translateContent(file);

			expect(translation).toBeDefined();
			expect(typeof translation).toBe("string");
		});

		test("should handle special characters and emojis", async () => {
			const contentWithEmojis = "Hello world! 🌍 This has special chars: àáâãäåæçèéêë";
			mockChatCompletionsCreate.mockResolvedValue({
				choices: [
					{ message: { content: "Olá mundo! 🌍 Isto tem caracteres especiais: àáâãäåæçèéêë" } },
				],
				usage: { total_tokens: 40 },
			} as ChatCompletion);

			const file: TranslationFile = {
				path: "test/special.md",
				content: contentWithEmojis,
				sha: "spc123",
				filename: "special.md",
			};

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
			mockChatCompletionsCreate.mockResolvedValue({
				choices: [{ message: { content: null } }],
				usage: { total_tokens: 10 },
			} as ChatCompletion);

			const file: TranslationFile = {
				path: "test/null.md",
				content: "Test content",
				sha: "null123",
				filename: "null.md",
			};

			expect(translatorService.translateContent(file)).rejects.toThrow();
		});

		test("should handle undefined response from API", () => {
			mockChatCompletionsCreate.mockResolvedValue({
				choices: [{ message: {} }],
				usage: { total_tokens: 10 },
			} as ChatCompletion);

			const file: TranslationFile = {
				path: "test/undefined.md",
				content: "Test content",
				sha: "undef123",
				filename: "undefined.md",
			};

			expect(translatorService.translateContent(file)).rejects.toThrow();
		});

		test("should handle empty choices array from API", () => {
			mockChatCompletionsCreate.mockResolvedValue({
				choices: [],
				usage: { total_tokens: 10 },
			} as unknown as ChatCompletion);

			const file: TranslationFile = {
				path: "test/empty-choices.md",
				content: "Test content",
				sha: "empty123",
				filename: "empty-choices.md",
			};

			expect(translatorService.translateContent(file)).rejects.toThrow();
		});

		test("should return false for invalid LLM response", () => {
			const invalidResponse = createMockChatCompletion({
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
