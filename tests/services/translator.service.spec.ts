/**
 * @fileoverview Tests for the {@link TranslatorService}.
 *
 * This suite covers content translation, error handling, language detection,
 * and all core translation workflow operations.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { LanguageConfig } from "@/services/language-detector.service";

import { TranslationFile, TranslatorService } from "@/services/translator.service";

describe("TranslatorService", () => {
	let translatorService: TranslatorService;
	let mockOpenAI: any;
	const config: LanguageConfig = {
		source: "en",
		target: "pt-br",
	};

	beforeEach(() => {
		translatorService = new TranslatorService(config);

		mockOpenAI = {
			chat: {
				completions: {
					create: mock(() =>
						Promise.resolve({
							choices: [{ message: { content: "Texto traduzido" } }],
						}),
					),
				},
			},
		};
	});

	describe("Constructor", () => {
		test("should initialize with valid language configuration", () => {
			expect(translatorService).toBeInstanceOf(TranslatorService);
			expect(translatorService.glossary).toBeNull();
		});

		test("should initialize language detector with provided config", () => {
			const service = new TranslatorService({ source: "fr", target: "pt-br" });
			expect(service).toBeInstanceOf(TranslatorService);
		});
	});

	describe("translateContent", () => {
		test("should translate content successfully", async () => {
			const mockResponse = {
				choices: [{ message: { content: "Olá mundo" } }],
			};
			mockOpenAI.chat.completions.create = mock(() => Promise.resolve(mockResponse));
			// @ts-expect-error - Mocking private property for testing
			translatorService.llm = mockOpenAI;

			const file: TranslationFile = {
				path: "test/file.md",
				content: "Hello world",
				sha: "abc123",
				filename: "file.md",
			};

			const translation = await translatorService.translateContent(file);

			expect(translation).toBe("Olá mundo");
			expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
		});

		test("should handle empty content with error", async () => {
			const file: TranslationFile = {
				path: "test/empty.md",
				content: "",
				sha: "def456",
				filename: "empty.md",
			};

			expect(await translatorService.translateContent(file)).rejects.toThrow(
				"File content is empty",
			);
		});

		test("should handle whitespace-only content", async () => {
			mockOpenAI.chat.completions.create = mock(() =>
				Promise.resolve({
					choices: [{ message: { content: "   \n\t  \n  " } }],
				}),
			);
			// @ts-expect-error - Mocking private property for testing
			translatorService.llm = mockOpenAI;

			const file: TranslationFile = {
				path: "test/whitespace.md",
				content: "   \n\t  \n  ",
				sha: "wht123",
				filename: "whitespace.md",
			};

			const result = await translatorService.translateContent(file);

			expect(result).toBeDefined();
			expect(typeof result).toBe("string");
		});

		test("should preserve code blocks in translated content", async () => {
			const mockResponse = {
				choices: [
					{
						message: {
							content: `# Título\n\`\`\`javascript\n// Comentário traduzido\nconst example = "test";\n\`\`\`\n\nTexto traduzido`,
						},
					},
				],
			};
			mockOpenAI.chat.completions.create = mock(() => Promise.resolve(mockResponse));
			// @ts-expect-error - Mocking private property for testing
			translatorService.llm = mockOpenAI;

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

		test("should handle API errors gracefully", async () => {
			mockOpenAI.chat.completions.create = mock(() => Promise.reject(new Error("API Error")));
			// @ts-expect-error - Mocking private property for testing
			translatorService.llm = mockOpenAI;

			const file: TranslationFile = {
				path: "test/error.md",
				content: "Error test content",
				sha: "mno345",
				filename: "error.md",
			};

			expect(await translatorService.translateContent(file)).rejects.toThrow("API Error");
		});

		test("should handle large content with chunking", async () => {
			const largeContent = "Large content ".repeat(1000);
			mockOpenAI.chat.completions.create = mock(() =>
				Promise.resolve({
					choices: [{ message: { content: "Conteúdo grande traduzido" } }],
				}),
			);
			// @ts-expect-error - Mocking private property for testing
			translatorService.llm = mockOpenAI;

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

	// TODO: These tests need to be updated to test public methods instead of private ones
	/*
	describe("cleanupTranslatedContent", () => {
		test("should remove markdown fences when not in original", () => {
			const translatedContent = `# Título\n\nTexto traduzido\n\`\`\``;
			const originalContent = `# Title\n\nOriginal text`;

			const cleaned = translatorService.cleanupTranslatedContent(
				translatedContent,
				originalContent,
			);

			expect(cleaned).toBe("# Título\n\nTexto traduzido");
			expect(cleaned).not.toEndWith("```");
		});

		test("should preserve markdown fences when in original", () => {
			const translatedContent = `# Título\n\nTexto traduzido\n\`\`\``;
			const originalContent = `# Title\n\nOriginal text\n\`\`\``;

			const cleaned = translatorService.cleanupTranslatedContent(
				translatedContent,
				originalContent,
			);

			expect(cleaned).toBe("# Título\n\nTexto traduzido\n```");
		});

		test("should handle content without YAML frontmatter prefix", () => {
			const translatedContent = "Some prefix content\n---\ntitle: Test\nContent here";

			const cleaned = translatorService.cleanupTranslatedContent(translatedContent);

			expect(cleaned).toBe("---\ntitle: Test\nContent here");
		});
	});
	*/

	// TODO: These tests need to be updated - chunkAndRetryTranslation method doesn't exist
	/*
	describe("chunkAndRetryTranslation", () => {
		test("should handle content chunking for large texts", async () => {
			const content =
				"# Large Section\n\nThis is a large content block that needs to be chunked. ".repeat(100);
			mockOpenAI.chat.completions.create = mock(() =>
				Promise.resolve({
					choices: [
						{
							message: {
								content:
									"# Seção Grande\n\nEste é um bloco de conteúdo grande que precisa ser dividido. ",
							},
						},
					],
				}),
			);
			// @ts-expect-error - Mocking private property for testing
			translatorService.llm = mockOpenAI;

			const result = await translatorService.chunkAndRetryTranslation(content);

			expect(result).toBeDefined();
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});

		test("should handle empty content in chunking", async () => {
			mockOpenAI.chat.completions.create = mock(() =>
				Promise.resolve({
					choices: [{ message: { content: null } }],
				}),
			);
			// @ts-expect-error - Mocking private property for testing
			translatorService.llm = mockOpenAI;

			expect(await translatorService.chunkAndRetryTranslation("test content")).rejects.toThrow(
				"No content returned",
			);
		});
	});
	*/

	describe("Edge Cases and Error Handling", () => {
		test("should handle malformed markdown content", async () => {
			const malformedContent = "# Incomplete header\n```\nUnclosed code block\n## Another header";
			mockOpenAI.chat.completions.create = mock(() =>
				Promise.resolve({
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
			// @ts-expect-error - Mocking private property for testing
			translatorService.llm = mockOpenAI;

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
			mockOpenAI.chat.completions.create = mock(() =>
				Promise.resolve({
					choices: [
						{ message: { content: "Olá mundo! 🌍 Isto tem caracteres especiais: àáâãäåæçèéêë" } },
					],
				}),
			);
			// @ts-expect-error - Mocking private property for testing
			translatorService.llm = mockOpenAI;

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
	});
});
