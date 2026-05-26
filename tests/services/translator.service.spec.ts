import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { TranslatorServiceDependencies } from "@/services/";

import { ApplicationError } from "@/errors";
import { localeService, TranslatorService } from "@/services/";

import {
	createChatCompletionFixture,
	createFrontmatterBatchLlmJsonContent,
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
import { testEnv } from "@tests/setup";

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

function queueOpenAiTranslationResponses(...messageContents: string[]) {
	let step = 0;
	mockChatCompletionsCreate.mockImplementation(() => {
		const content = messageContents[step] ?? messageContents.at(-1) ?? "";
		step += 1;
		return Promise.resolve(createChatCompletionFixture(content));
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
			expect(translatorService.translationGuidelines).toBeNull();
		});

		test("should initialize language detector with provided config", () => {
			const translatorService = createTestTranslatorService();

			expect(translatorService).toBeInstanceOf(TranslatorService);
			expect(translatorService.services.languageDetector).toBeDefined();
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

			const analysis = await translatorService.managers.languageCheck.getLanguageAnalysis(file);

			expect(analysis).toBe(expectedAnalysis);
			expect(analyzeSpy).toHaveBeenCalledWith(file.filename, file.content);
		});

		test("throws ApplicationError when file content is empty", () => {
			const file = createTranslationFileFixture({ content: "" });

			expect(translatorService.managers.languageCheck.getLanguageAnalysis(file)).rejects.toThrow(
				"File content is empty",
			);
		});
	});

	describe("translateContent", () => {
		test("should translate content successfully when valid content is provided", async () => {
			mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture("Olá mundo"));

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
			mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture("   \n\t  \n  "));

			const file = createTranslationFileFixture({ content: "   \n\t  \n  " });

			expect(translatorService.translateContent(file)).rejects.toThrow(
				"Translation produced empty content",
			);
		});

		test("should preserve code blocks in translated content", async () => {
			const title = "Title";
			const sourceContent = `# Title\n\`\`\`javascript\n// Comment\nconst example = "test";\n\`\`\`\n\nText`;
			const translatedContent = `# Título\n\`\`\`javascript\n// Comentário traduzido\nconst example = "test";\n\`\`\`\n\nTexto traduzido`;
			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);

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

		test("should trigger chunking for large content and call LLM once per chunk", async () => {
			const sections = Array.from(
				{ length: 30 },
				(_, i) => `## Section ${i + 1}\n\n${"Documentation paragraph. ".repeat(60)}`,
			);
			const largeContent = sections.join("\n\n");

			const translatedSections = Array.from(
				{ length: 30 },
				(_, i) => `## Seção ${i + 1}\n\n${"Parágrafo de documentação. ".repeat(60)}`,
			);

			let chunkCallIndex = 0;
			let firstSystemPrompt: string | undefined;
			const { chunks } = await new (await import("@/services/translator/managers")).ChunksManager(
				"test-model",
			).chunkContent(largeContent);

			mockChatCompletionsCreate.mockImplementation(async (params: unknown) => {
				const { messages } = params as { messages: { role: string; content: string }[] };
				const systemMessage = messages.find((message) => message.role === "system");
				if (chunkCallIndex === 0) {
					firstSystemPrompt = systemMessage?.content;
				}
				const idx = chunkCallIndex++;
				const translatedChunk =
					translatedSections[idx] ?? `## Seção\n\nConteúdo traduzido fragmento ${idx + 1}.`;
				return Promise.resolve(createChatCompletionFixture(translatedChunk));
			});

			const file = createTranslationFileFixture({ content: largeContent });

			const needsChunking = translatorService.managers.chunks.needsChunking(file);
			expect(needsChunking).toBe(true);

			const translation = await translatorService.translateContent(file);

			expect(translation).toBeDefined();
			expect(typeof translation).toBe("string");
			expect(translation.length).toBeGreaterThan(0);
			expect(mockChatCompletionsCreate.mock.calls.length).toBe(chunks.length);
			expect(firstSystemPrompt).toBeDefined();
			expect(firstSystemPrompt).toContain("DOCUMENT SLICE");
			expect(firstSystemPrompt).toContain(`slice 1 of ${chunks.length}`);
		});

		describe("verbatim fence masking (LLM payload)", () => {
			const previousMask = {
				fences: false,
				minTokens: 120,
			};

			beforeEach(() => {
				previousMask.fences = testEnv.MASK_VERBATIM_LARGE_FENCES;
				previousMask.minTokens = testEnv.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS;
				testEnv.MASK_VERBATIM_LARGE_FENCES = false;
				testEnv.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS = 120;
			});

			afterEach(() => {
				testEnv.MASK_VERBATIM_LARGE_FENCES = previousMask.fences;
				testEnv.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS = previousMask.minTokens;
				mockChatCompletionsCreate.mockReset();
				mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture());
			});

			test("sends fenced line comments and JSX text inside small blocks to the LLM when masking is off", async () => {
				const inner =
					'// "what" to animate.\n<ViewTransition>\n\t<div>animate me</div>\n</ViewTransition>\n';
				const markdown =
					"# Title\n\n## Section\n\nTo opt-in, wrap it.\n\n```js\n" + inner + "```\n\nAfter.\n";

				let capturedUserContent: string | undefined;

				mockChatCompletionsCreate.mockImplementation((params: unknown) => {
					const { messages } = params as {
						messages: { role: string; content: string }[];
					};
					const userMessage = messages.find((message) => message.role === "user");
					capturedUserContent = userMessage?.content;

					return Promise.resolve(
						createChatCompletionFixture(
							"# Título\n\n## Seção\n\nPara optar, envolva.\n\n```js\n" +
								inner +
								"```\n\nDepois.\n",
						),
					);
				});

				const file = createTranslationFileFixture({ content: markdown });
				await translatorService.translateContent(file);

				expect(capturedUserContent).toBeDefined();
				expect(capturedUserContent).toContain('// "what" to animate.');
				expect(capturedUserContent).toContain("animate me");
			});

			test("when masking is on, natural language inside a masked large fence never reaches the LLM and is restored verbatim", async () => {
				testEnv.MASK_VERBATIM_LARGE_FENCES = true;
				testEnv.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS = 80;

				const filler = "const x = 1;\n".repeat(400);
				const secretSentence = "ONLY_SENTENCE_THAT_NEED_TRANSLATION";
				const markdown =
					"# Doc\n\n```js\n" + filler + secretSentence + "\n```\n\n## Outro\n\nFinal line.\n";

				let capturedUserContent: string | undefined;

				mockChatCompletionsCreate.mockImplementation((params: unknown) => {
					const { messages } = params as {
						messages: { role: string; content: string }[];
					};
					const userMessage = messages.find((message) => message.role === "user");
					capturedUserContent = userMessage?.content;
					const echoed = userMessage?.content ?? "";

					return Promise.resolve(createChatCompletionFixture(echoed));
				});

				const file = createTranslationFileFixture({ content: markdown });
				const result = await translatorService.translateContent(file);

				expect(capturedUserContent).toBeDefined();
				expect(capturedUserContent).not.toContain(secretSentence);
				expect(result).toContain(secretSentence);
				expect(result).toContain("# Doc");
			});

			test("when masking is on but the threshold is very high, small fences still reach the LLM", async () => {
				testEnv.MASK_VERBATIM_LARGE_FENCES = true;
				testEnv.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS = 50_000;

				const inner = '// "what" to animate.\n<div>animate me</div>\n';
				const markdown = "# Title\n\n```js\n" + inner + "```\n";

				let capturedUserContent: string | undefined;

				mockChatCompletionsCreate.mockImplementation((params: unknown) => {
					const { messages } = params as {
						messages: { role: string; content: string }[];
					};
					const userMessage = messages.find((message) => message.role === "user");
					capturedUserContent = userMessage?.content;

					return Promise.resolve(createChatCompletionFixture(markdown));
				});

				const file = createTranslationFileFixture({ content: markdown });
				await translatorService.translateContent(file);

				expect(capturedUserContent).toContain('// "what" to animate.');
				expect(capturedUserContent).toContain("animate me");
			});
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

			const isTranslated = await translatorService.managers.languageCheck.isContentTranslated(file);

			expect(isTranslated).toBe(false);
		});

		test("should detect Portuguese content as translated", async () => {
			spyOn(translatorService.services.languageDetector, "analyzeLanguage").mockResolvedValue(
				createLanguageAnalysisResultFixture(),
			);

			const file = createTranslationFileFixture({
				content: "Este é um conteúdo em português que já foi traduzido.",
			});

			const isTranslated = await translatorService.managers.languageCheck.isContentTranslated(file);

			expect(isTranslated).toBe(true);
		});

		test("should handle mixed language content", async () => {
			const file = createTranslationFileFixture({
				content: "This has some English and também algum português.",
			});

			const isTranslated = await translatorService.managers.languageCheck.isContentTranslated(file);

			expect(typeof isTranslated).toBe("boolean");
		});

		test("returns false when language analysis throws", async () => {
			spyOn(translatorService.services.languageDetector, "analyzeLanguage").mockRejectedValue(
				new Error("Detection failed"),
			);

			const file = createTranslationFileFixture({ content: "Some content." });

			const isTranslated = await translatorService.managers.languageCheck.isContentTranslated(file);

			expect(isTranslated).toBe(false);
		});
	});

	describe("Code Block Preservation Validation", () => {
		test("should pass validation when code block count matches between source and translation", async () => {
			const title = "Title";
			const sourceContent = `# Title\n\n\`\`\`javascript\nconst x = 1;\n\`\`\`\n\nText\n\n\`\`\`python\nprint("hello")\n\`\`\``;
			const translatedContent = `# Título\n\n\`\`\`javascript\nconst x = 1;\n\`\`\`\n\nTexto\n\n\`\`\`python\nprint("hello")\n\`\`\``;
			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);

			const translation = await translatorService.translateContent(file);

			expect(translation).toContain(translatedContent);
			expect(translation).toContain("title:");
		});

		test("should warn when code blocks are lost during translation", async () => {
			const sourceContent = `# Title\n\n\`\`\`javascript\nconst x = 1;\n\`\`\`\n\nText\n\n\`\`\`python\nprint("hello")\n\`\`\``;
			const translatedContent = `# Título\n\nTexto traduzido sem blocos de código`;

			mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture(translatedContent));

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");
			await translatorService.translateContent(file);
			expect(warnSpy).toHaveBeenCalled();
		});

		test("should warn when code block count differs significantly (>20%)", async () => {
			const sourceContent = `# Title\n\n\`\`\`js\n1\n\`\`\`\n\n\`\`\`js\n2\n\`\`\`\n\n\`\`\`js\n3\n\`\`\`\n\n\`\`\`js\n4\n\`\`\`\n\n\`\`\`js\n5\n\`\`\``;
			const translatedContent = `# Título\n\n\`\`\`js\n1\n\`\`\`\n\n\`\`\`js\n2\n\`\`\`\n\n\`\`\`js\n3\n\`\`\``;

			mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture(translatedContent));

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");
			await translatorService.translateContent(file);
			expect(warnSpy).toHaveBeenCalled();
		});

		test("should not throw Error when source has no code blocks", () => {
			const title = "Title";
			const sourceContent = `# Title\n\nText without code blocks`;
			const translatedContent = `# Título\n\nTexto sem blocos de código`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);

			expect(translatorService.translateContent(file)).resolves.not.toThrow(ApplicationError);
		});

		test("should not throw Error when code block ratio is within acceptable range", () => {
			const title = "Title";
			const sourceContent = `# Title\n\n\`\`\`js\ncode1\n\`\`\`\n\n\`\`\`js\ncode2\n\`\`\`\n\n\`\`\`js\ncode3\n\`\`\`\n\n\`\`\`js\ncode4\n\`\`\`\n\n\`\`\`js\ncode5\n\`\`\``;
			const translatedContent = `# Título\n\n\`\`\`js\ncode1\n\`\`\`\n\n\`\`\`js\ncode2\n\`\`\`\n\n\`\`\`js\ncode3\n\`\`\`\n\n\`\`\`js\ncode4\n\`\`\``;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);
			expect(translatorService.translateContent(file)).resolves.not.toThrow(ApplicationError);
		});
	});

	describe("Link Preservation Validation", () => {
		test("should pass validation when link count matches between source and translation", async () => {
			const title = "Title";
			const sourceContent = `# Title\n\nCheck [React docs](https://react.dev) and [MDN](https://developer.mozilla.org).`;
			const translatedContent = `# Título\n\nVeja [documentação React](https://react.dev) e [MDN](https://developer.mozilla.org).`;
			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);

			const translation = await translatorService.translateContent(file);

			expect(translation).toContain(translatedContent);
			expect(translation).toContain("title:");
		});

		test("should log warning when links are lost during translation", async () => {
			const title = "Title";
			const sourceContent = `# Title\n\n[Link 1](https://example.com/1)\n[Link 2](https://example.com/2)\n[Link 3](https://example.com/3)`;
			const translatedContent = `# Título\n\nTexto traduzido sem links`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);
			const warnSpy = spyOn(file.logger, "warn");
			await translatorService.translateContent(file);

			expect(warnSpy).toHaveBeenCalled();
		});

		test("should log warning when link count differs significantly (>20%)", async () => {
			const title = "Title";
			const sourceContent = `# Title\n\n[1](u1) [2](u2) [3](u3) [4](u4) [5](u5)`;
			const translatedContent = `# Título\n\n[1](u1) [2](u2) [3](u3)`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);
			const warnSpy = spyOn(file.logger, "warn");
			await translatorService.translateContent(file);

			expect(warnSpy).toHaveBeenCalled();
		});

		test("should not throw Error when source has no links", () => {
			const title = "Title";
			const sourceContent = `# Title\n\nText without links`;
			const translatedContent = `# Título\n\nTexto sem links`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);
			expect(translatorService.translateContent(file)).resolves.not.toThrow(ApplicationError);
		});

		test("should not throw Error when link ratio is within acceptable range", () => {
			const title = "Title";
			const sourceContent = `# Title\n\n[1](u1) [2](u2) [3](u3) [4](u4) [5](u5)`;
			const translatedContent = `# Título\n\n[1](u1) [2](u2) [3](u3) [4](u4)`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);
			expect(translatorService.translateContent(file)).resolves.not.toThrow(ApplicationError);
		});

		test("should not throw Error when links with titles", () => {
			const title = "Title";
			const sourceContent = `# Title\n\n[React](https://react.dev "React docs") and [MDN](https://mdn.dev "MDN Web Docs")`;
			const translatedContent = `# Título\n\n[React](https://react.dev "Docs React") e [MDN](https://mdn.dev "MDN Web Docs")`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);
			expect(translatorService.translateContent(file)).resolves.not.toThrow(ApplicationError);
		});
	});

	describe("Frontmatter Validation", () => {
		test("should pass validation when frontmatter keys match between source and translation", async () => {
			const sourceContent = `---\ntitle: 'Hello'\ndescription: 'Welcome'\n---\n\n# Content`;
			const translatedBody = `# Conteúdo`;

			queueOpenAiTranslationResponses(
				translatedBody,
				createFrontmatterBatchLlmJsonContent("Bem-vindo"),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const result = await translatorService.translateContent(file);
			expect(result).toContain("Bem-vindo");
			expect(result).toContain("Hello");
		});

		test("should preserve original title in YAML when the model returns body without frontmatter", async () => {
			const sourceContent = `---\ntitle: 'Hello'\n---\n\n# Content`;
			const translatedContent = `# Conteúdo`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent });
			const result = await translatorService.translateContent(file);
			expect(result.startsWith("---\n")).toBe(true);
			expect(result).toContain("Hello");
			expect(result).not.toContain("Olá");
			expect(result).toContain("# Conteúdo");
		});

		test("should keep non-translated keys and preserve title when the model emits a shorter YAML block", async () => {
			const sourceContent = `---\ntitle: 'Hello'\ncustom_key: 'value'\nauthor: 'John'\n---\n\n# Content`;
			const translatedBody = `# Conteúdo`;

			queueOpenAiTranslationResponses(translatedBody);

			const file = createTranslationFileFixture({ content: sourceContent });
			const result = await translatorService.translateContent(file);
			expect(result).toContain("custom_key: 'value'");
			expect(result).toContain("author: 'John'");
			expect(result).toContain("# Conteúdo");
			expect(result).toContain("Hello");
			expect(result).not.toContain("Olá");
		});

		test("should keep long non-translated YAML scalars on one physical line in frontmatter", async () => {
			const longAuthor = "A".repeat(120);
			const sourceContent = `---\ntitle: Hello\nauthor: '${longAuthor}'\n---\n\n# Content`;
			const translatedBody = `# Conteúdo`;

			queueOpenAiTranslationResponses(translatedBody);

			const file = createTranslationFileFixture({ content: sourceContent });
			const result = await translatorService.translateContent(file);

			const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(result);
			expect(frontmatterMatch).not.toBeNull();
			if (frontmatterMatch === null) {
				throw new Error("expected leading YAML frontmatter block");
			}

			const innerYaml = frontmatterMatch[1];
			expect(innerYaml).toBeDefined();
			if (innerYaml === undefined) {
				throw new Error("expected inner YAML capture in frontmatter regex");
			}

			const authorLine = innerYaml.split("\n").find((line) => line.startsWith("author:"));
			expect(authorLine).toBeDefined();
			if (authorLine === undefined) {
				throw new Error("expected author field line in frontmatter");
			}
			expect(authorLine.length).toBeGreaterThan(110);
		});

		test("should not throw Error when source has no frontmatter", () => {
			const title = "Title";
			const sourceContent = `# Content without frontmatter`;
			const translatedContent = `# Conteúdo sem frontmatter`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);
			expect(translatorService.translateContent(file)).resolves.not.toThrow(ApplicationError);
		});

		test("should not throw Error when frontmatter with various key formats", async () => {
			const sourceContent = `---\ntitle: 'Test'\nsnake_case_key: 'value'\ncamelCaseKey: 'value2'\nKEY123: 'value3'\n---\n\n# Content`;
			const translatedBody = `# Conteúdo`;

			queueOpenAiTranslationResponses(translatedBody);

			const file = createTranslationFileFixture({ content: sourceContent });
			const result = await translatorService.translateContent(file);
			expect(result).toContain("Test");
			expect(result).not.toContain("Teste");
		});
	});

	describe("Edge Cases", () => {
		test("should handle malformed markdown content", () => {
			const malformedContent = "# Incomplete header\n```\nUnclosed code block\n## Another header";
			mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture(malformedContent));

			const file = createTranslationFileFixture({ content: malformedContent });
			expect(translatorService.translateContent(file)).resolves.not.toThrow(ApplicationError);
		});

		test("should handle special characters and emojis", async () => {
			const contentWithEmojis = "Hello world! 🌍 This has special chars: àáâãäåæçèéêë";
			mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture(contentWithEmojis));

			const file = createTranslationFileFixture({ content: contentWithEmojis });

			const translation = await translatorService.translateContent(file);

			expect(translation).toContain("🌍");
			expect(translation).toContain("àáâãäåæçèéêë");
		});

		test("should handle translation guidelines integration", () => {
			const translationGuidelines = "React - React\ncomponent - componente\nprops - propriedades";

			translatorService.translationGuidelines = translationGuidelines;

			expect(translatorService.translationGuidelines).toBe(translationGuidelines);
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
