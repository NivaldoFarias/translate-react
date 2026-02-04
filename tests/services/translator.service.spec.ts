import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { TranslatorServiceDependencies } from "@/services/";

import { localeService, TranslationFile, TranslatorService } from "@/services/";

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
			maxTimeout: overrides.retryConfig?.maxTimeout ?? 1_000,
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

		describe("logger", () => {
			test("should create logger with file context when no parent logger provided", () => {
				const file = createTranslationFileFixture({
					filename: "test.md",
					path: "src/test.md",
				});

				expect(file.logger).toBeDefined();
				expect(file.correlationId).toBeDefined();
				expect(typeof file.correlationId).toBe("string");
				expect(file.correlationId.length).toBeGreaterThan(0);
			});

			test("should create logger with file context properties", () => {
				const file = createTranslationFileFixture({
					filename: "example.md",
					path: "docs/example.md",
				});

				expect(file.logger).toBeDefined();
				expect(file.correlationId).toBeDefined();
				expect(typeof file.correlationId).toBe("string");
				expect(file.correlationId.length).toBeGreaterThan(0);

				const logSpy = spyOn(file.logger, "debug");
				file.logger.debug({ additional: "data" }, "test message");

				expect(logSpy).toHaveBeenCalled();
			});

			test("should generate unique correlation ID for each file instance", () => {
				const file1 = createTranslationFileFixture({ filename: "file1.md" });
				const file2 = createTranslationFileFixture({ filename: "file2.md" });

				expect(file1.correlationId).not.toBe(file2.correlationId);
			});

			test("should maintain same correlation ID across file lifecycle", () => {
				const file = createTranslationFileFixture({ filename: "test.md" });

				const correlationId1 = file.correlationId;
				const correlationId2 = file.correlationId;

				expect(correlationId1).toBe(correlationId2);
				expect(correlationId1).toBe(file.correlationId);
			});

			test("should use parent logger when provided", () => {
				const parentLogger = createTranslationFileFixture({ filename: "parent.md" }).logger;

				const file = new TranslationFile(
					"# Content",
					"child.md",
					"src/child.md",
					"sha123",
					parentLogger,
				);

				expect(file.logger).toBeDefined();
				expect(file.correlationId).toBeDefined();
			});
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
			const analyzeSpy = spyOn(
				translatorService.services.languageDetector,
				"analyzeLanguage",
			).mockResolvedValue(expectedAnalysis);

			const file = createTranslationFileFixture({ content: "Conteúdo em português." });

			const analysis = await translatorService.getLanguageAnalysis(file);

			expect(analysis).toBe(expectedAnalysis);
			expect(analyzeSpy).toHaveBeenCalledWith(file.filename, file.content);
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
			const largeContent = "Large content ".repeat(1_000);
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

		test("returns false when language analysis throws", async () => {
			spyOn(translatorService.services.languageDetector, "analyzeLanguage").mockRejectedValue(
				new Error("Detection failed"),
			);

			const file = createTranslationFileFixture({ content: "Some content." });

			const isTranslated = await translatorService.isContentTranslated(file);

			expect(isTranslated).toBe(false);
		});
	});

	describe("Code Block Preservation Validation", () => {
		test("should pass validation when code block count matches between source and translation", async () => {
			const sourceContent = `# Title\n\n\`\`\`javascript\nconst x = 1;\n\`\`\`\n\nText\n\n\`\`\`python\nprint("hello")\n\`\`\``;
			const translatedContent = `# Título\n\n\`\`\`javascript\nconst x = 1;\n\`\`\`\n\nTexto\n\n\`\`\`python\nprint("hello")\n\`\`\``;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });

			const translation = await translatorService.translateContent(file);

			expect(translation).toBe(translatedContent);
		});

		test("should warn when code blocks are lost during translation", async () => {
			const sourceContent = `# Title\n\n\`\`\`javascript\nconst x = 1;\n\`\`\`\n\nText\n\n\`\`\`python\nprint("hello")\n\`\`\``;
			const translatedContent = `# Título\n\nTexto traduzido sem blocos de código`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					originalCodeBlocks: 2,
					translatedCodeBlocks: 0,
				}),
				expect.stringContaining("code block count mismatch"),
			);
		});

		test("should warn when code block count differs significantly (>20%)", async () => {
			const sourceContent = `# Title\n\n\`\`\`js\n1\n\`\`\`\n\n\`\`\`js\n2\n\`\`\`\n\n\`\`\`js\n3\n\`\`\`\n\n\`\`\`js\n4\n\`\`\`\n\n\`\`\`js\n5\n\`\`\``;
			const translatedContent = `# Título\n\n\`\`\`js\n1\n\`\`\`\n\n\`\`\`js\n2\n\`\`\`\n\n\`\`\`js\n3\n\`\`\``;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					originalCodeBlocks: 5,
					translatedCodeBlocks: 3,
				}),
				expect.stringContaining("code block count mismatch"),
			);
		});

		test("should skip code block validation when source has no code blocks", async () => {
			const sourceContent = `# Title\n\nText without code blocks`;
			const translatedContent = `# Título\n\nTexto sem blocos de código`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const debugSpy = spyOn(file.logger, "debug");

			await translatorService.translateContent(file);

			expect(debugSpy).toHaveBeenCalledWith(
				"Original file contains no code blocks. Skipping code block validation",
			);
		});

		test("should not warn when code block ratio is within acceptable range", async () => {
			const sourceContent = `# Title\n\n\`\`\`js\ncode1\n\`\`\`\n\n\`\`\`js\ncode2\n\`\`\`\n\n\`\`\`js\ncode3\n\`\`\`\n\n\`\`\`js\ncode4\n\`\`\`\n\n\`\`\`js\ncode5\n\`\`\``;
			const translatedContent = `# Título\n\n\`\`\`js\ncode1\n\`\`\`\n\n\`\`\`js\ncode2\n\`\`\`\n\n\`\`\`js\ncode3\n\`\`\`\n\n\`\`\`js\ncode4\n\`\`\``;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			const codeBlockWarnCalls = warnSpy.mock.calls.filter(
				(call) => typeof call[1] === "string" && call[1].includes("code block count mismatch"),
			);
			expect(codeBlockWarnCalls.length).toBe(0);
		});
	});

	describe("Link Preservation Validation", () => {
		test("should pass validation when link count matches between source and translation", async () => {
			const sourceContent = `# Title\n\nCheck [React docs](https://react.dev) and [MDN](https://developer.mozilla.org).`;
			const translatedContent = `# Título\n\nVeja [documentação React](https://react.dev) e [MDN](https://developer.mozilla.org).`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });

			const translation = await translatorService.translateContent(file);

			expect(translation).toBe(translatedContent);
		});

		test("should warn when links are lost during translation", async () => {
			const sourceContent = `# Title\n\n[Link 1](https://example.com/1)\n[Link 2](https://example.com/2)\n[Link 3](https://example.com/3)`;
			const translatedContent = `# Título\n\nTexto traduzido sem links`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					originalLinks: 3,
					translatedLinks: 0,
				}),
				expect.stringContaining("link count mismatch"),
			);
		});

		test("should warn when link count differs significantly (>20%)", async () => {
			const sourceContent = `# Title\n\n[1](u1) [2](u2) [3](u3) [4](u4) [5](u5)`;
			const translatedContent = `# Título\n\n[1](u1) [2](u2) [3](u3)`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					originalLinks: 5,
					translatedLinks: 3,
				}),
				expect.stringContaining("link count mismatch"),
			);
		});

		test("should skip link validation when source has no links", async () => {
			const sourceContent = `# Title\n\nText without links`;
			const translatedContent = `# Título\n\nTexto sem links`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const debugSpy = spyOn(file.logger, "debug");

			await translatorService.translateContent(file);

			expect(debugSpy).toHaveBeenCalledWith(
				"Original file contains no markdown links. Skipping link validation",
			);
		});

		test("should not warn when link ratio is within acceptable range", async () => {
			const sourceContent = `# Title\n\n[1](u1) [2](u2) [3](u3) [4](u4) [5](u5)`;
			const translatedContent = `# Título\n\n[1](u1) [2](u2) [3](u3) [4](u4)`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			const linkWarnCalls = warnSpy.mock.calls.filter(
				(call) => typeof call[1] === "string" && call[1].includes("link count mismatch"),
			);
			expect(linkWarnCalls.length).toBe(0);
		});

		test("should handle links with titles", async () => {
			const sourceContent = `# Title\n\n[React](https://react.dev "React docs") and [MDN](https://mdn.dev "MDN Web Docs")`;
			const translatedContent = `# Título\n\n[React](https://react.dev "Docs React") e [MDN](https://mdn.dev "MDN Web Docs")`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			const linkWarnCalls = warnSpy.mock.calls.filter(
				(call) => typeof call[1] === "string" && call[1].includes("link count mismatch"),
			);
			expect(linkWarnCalls.length).toBe(0);
		});
	});

	describe("Frontmatter Validation", () => {
		test("should pass validation when frontmatter keys match between source and translation", async () => {
			const sourceContent = `---\ntitle: 'Hello'\ndescription: 'Welcome'\n---\n\n# Content`;
			const translatedContent = `---\ntitle: 'Olá'\ndescription: 'Bem-vindo'\n---\n\n# Conteúdo`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			const frontmatterWarnCalls = warnSpy.mock.calls.filter(
				(call) => typeof call[1] === "string" && call[1].includes("frontmatter"),
			);
			expect(frontmatterWarnCalls.length).toBe(0);
		});

		test("should warn when frontmatter is completely lost during translation", async () => {
			const sourceContent = `---\ntitle: 'Hello'\n---\n\n# Content`;
			const translatedContent = `# Conteúdo sem frontmatter`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.objectContaining({ filename: file.filename }),
				expect.stringContaining("Frontmatter lost during translation"),
			);
		});

		test("should warn when required key 'title' is missing in translation", async () => {
			const sourceContent = `---\ntitle: 'Hello'\ndescription: 'Test'\n---\n\n# Content`;
			const translatedContent = `---\ndescription: 'Teste'\n---\n\n# Conteúdo`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					missingRequiredKeys: expect.arrayContaining(["title"]),
				} as Record<string, unknown>),
				expect.stringContaining("Required frontmatter keys missing"),
			);
		});

		test("should warn when non-required keys are missing in translation", async () => {
			const sourceContent = `---\ntitle: 'Hello'\ncustom_key: 'value'\nauthor: 'John'\n---\n\n# Content`;
			const translatedContent = `---\ntitle: 'Olá'\n---\n\n# Conteúdo`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					missingKeys: expect.arrayContaining(["custom_key", "author"]),
				} as Record<string, unknown>),
				expect.stringContaining("Some frontmatter keys missing"),
			);
		});

		test("should skip frontmatter validation when source has no frontmatter", async () => {
			const sourceContent = `# Content without frontmatter`;
			const translatedContent = `# Conteúdo sem frontmatter`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const debugSpy = spyOn(file.logger, "debug");

			await translatorService.translateContent(file);

			expect(debugSpy).toHaveBeenCalledWith(
				"Original file contains no frontmatter. Skipping frontmatter validation",
			);
		});

		test("should handle frontmatter with various key formats", async () => {
			const sourceContent = `---\ntitle: 'Test'\nsnake_case_key: 'value'\ncamelCaseKey: 'value2'\nKEY123: 'value3'\n---\n\n# Content`;
			const translatedContent = `---\ntitle: 'Teste'\nsnake_case_key: 'valor'\ncamelCaseKey: 'valor2'\nKEY123: 'valor3'\n---\n\n# Conteúdo`;

			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({ choices: [{ message: { content: translatedContent } }] }),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");

			await translatorService.translateContent(file);

			const frontmatterWarnCalls = warnSpy.mock.calls.filter(
				(call) => typeof call[1] === "string" && call[1].includes("frontmatter"),
			);
			expect(frontmatterWarnCalls.length).toBe(0);
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
