import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { TranslatorServiceDependencies } from "@/app/services/translator/translator.service";

import { localeService } from "@/app/composition";
import { OpenRouterModelLimitsService } from "@/app/services/openrouter/openrouter-model-limits.service";
import * as segmentMarkdown from "@/app/services/translator/markdown/segments";
import { TranslatorService } from "@/app/services/translator/translator.service";
import { ApplicationError, ErrorCode } from "@/shared/errors";

import {
	createChatCompletionFixture,
	createFrontmatterBatchLlmJsonContent,
	createLanguageAnalysisResultFixture,
	createOpenAIApiErrorFixture,
	createSegmentBatchLlmJsonContent,
	createTranslationFileFixture,
} from "@tests/fixtures";
import { hydrateRootMd } from "@tests/fixtures/react-docs-fixtures";
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
		openRouterModelLimitsService:
			overrides.openRouterModelLimitsService ?? new OpenRouterModelLimitsService(),
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

function getUserMessageFromCompletionParams(params: unknown) {
	const { messages } = params as { messages: { role: string; content: string }[] };
	return messages.find((message) => message.role === "user");
}

function isSegmentBatchUserMessage(content: string) {
	try {
		const parsed = JSON.parse(content) as { items?: { segmentId?: string }[] };
		return Array.isArray(parsed.items) && parsed.items[0]?.segmentId !== undefined;
	} catch {
		return false;
	}
}

function isFrontmatterBatchUserMessage(content: string) {
	try {
		const parsed = JSON.parse(content) as { items?: { fieldKey?: string }[] };
		return Array.isArray(parsed.items) && parsed.items[0]?.fieldKey !== undefined;
	} catch {
		return false;
	}
}

/**
 * Mocks LLM completions for segment-batch body translation, with optional legacy/frontmatter queue.
 *
 * @param segmentTranslations Maps segment `source` strings to translated text
 * @param legacyResponses Plain-text responses for full-body fallback calls, in order
 */
function mockSegmentAwareTranslation(
	segmentTranslations: Record<string, string>,
	...legacyResponses: string[]
) {
	let legacyStep = 0;

	mockChatCompletionsCreate.mockImplementation((params: unknown) => {
		const userMessage = getUserMessageFromCompletionParams(params);
		const userContent = userMessage?.content ?? "";

		if (isSegmentBatchUserMessage(userContent)) {
			const payload = JSON.parse(userContent) as {
				items: { segmentId: string; source: string }[];
			};

			return Promise.resolve(
				createChatCompletionFixture(
					createSegmentBatchLlmJsonContent(
						payload.items.map((item) => ({
							segmentId: item.segmentId,
							translated: segmentTranslations[item.source] ?? item.source,
						})),
					),
				),
			);
		}

		if (isFrontmatterBatchUserMessage(userContent)) {
			const legacyContent = legacyResponses[legacyStep] ?? legacyResponses.at(-1) ?? userContent;
			legacyStep += 1;
			return Promise.resolve(createChatCompletionFixture(legacyContent));
		}

		const legacyContent = legacyResponses[legacyStep] ?? legacyResponses.at(-1) ?? userContent;
		legacyStep += 1;
		return Promise.resolve(createChatCompletionFixture(legacyContent));
	});
}

function chatCallUsedSegmentBatch(params: unknown) {
	const userMessage = getUserMessageFromCompletionParams(params);
	return Boolean(userMessage && isSegmentBatchUserMessage(userMessage.content));
}

function chatCallUsedMarkdownDocument(params: unknown) {
	const userMessage = getUserMessageFromCompletionParams(params);
	if (!userMessage || isSegmentBatchUserMessage(userMessage.content)) {
		return false;
	}

	if (isFrontmatterBatchUserMessage(userMessage.content)) {
		return false;
	}

	return userMessage.content.length > 0;
}

function collectSegmentBatchSources() {
	const sources: string[] = [];

	for (const [params] of mockChatCompletionsCreate.mock.calls) {
		const userMessage = getUserMessageFromCompletionParams(params);
		if (!userMessage || !isSegmentBatchUserMessage(userMessage.content)) {
			continue;
		}

		const payload = JSON.parse(userMessage.content) as {
			items: { source: string }[];
		};
		sources.push(...payload.items.map((item) => item.source));
	}

	return sources;
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
			mockSegmentAwareTranslation({ "Hello world": "Olá mundo" });

			const file = createTranslationFileFixture({ content: "Hello world" });

			const result = await translatorService.translateContent(file);

			expect(result.content).toBe("Olá mundo");
			expect(result.reviewerNotices).toEqual([]);
			expect(result.llmUsage.totalTokens).toBeGreaterThanOrEqual(0);
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

			mockSegmentAwareTranslation({
				Title: "Título",
				Text: "Texto traduzido",
			});

			const file = createTranslationFileFixture({ content: sourceContent }, title);

			const result = await translatorService.translateContent(file);

			expect(result.content).toContain("Título");
			expect(result.content).toContain("// Comment");
			expect(result.content).toContain('const example = "test"');
			expect(result.content).toContain("```javascript");
			expect(result.content).toContain("Texto traduzido");
			expect(result.content).not.toContain("Comentário traduzido");
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

		test("should batch large content into multiple segment LLM calls", async () => {
			const sections = Array.from(
				{ length: 30 },
				(_, i) => `## Section ${i + 1}\n\n${"Documentation paragraph. ".repeat(60)}`,
			);
			const largeContent = sections.join("\n\n");

			let segmentBatchCallCount = 0;

			mockChatCompletionsCreate.mockImplementation((params: unknown) => {
				const userMessage = getUserMessageFromCompletionParams(params);
				const userContent = userMessage?.content ?? "";

				if (!isSegmentBatchUserMessage(userContent)) {
					return Promise.resolve(createChatCompletionFixture(userContent));
				}

				segmentBatchCallCount += 1;
				const payload = JSON.parse(userContent) as {
					items: { segmentId: string; source: string }[];
				};

				return Promise.resolve(
					createChatCompletionFixture(
						createSegmentBatchLlmJsonContent(
							payload.items.map((item) => ({
								segmentId: item.segmentId,
								translated: item.source
									.replace(/Section/g, "Seção")
									.replace(/Documentation paragraph/g, "Parágrafo de documentação"),
							})),
						),
					),
				);
			});

			const file = createTranslationFileFixture({ content: largeContent });

			const needsChunking = translatorService.managers.chunks.needsChunking(file);
			expect(needsChunking).toBe(true);

			const result = await translatorService.translateContent(file);

			expect(result).toBeDefined();
			expect(typeof result.content).toBe("string");
			expect(result.content.length).toBeGreaterThan(0);
			expect(segmentBatchCallCount).toBeGreaterThan(1);
			expect(result.content).toContain("Seção");
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

			test("does not send fenced block body text in segment batch payloads when masking is off", async () => {
				const inner =
					'// "what" to animate.\n<ViewTransition>\n\t<div>animate me</div>\n</ViewTransition>\n';
				const markdown =
					"# Title\n\n## Section\n\nTo opt-in, wrap it.\n\n```js\n" + inner + "```\n\nAfter.\n";

				mockSegmentAwareTranslation({
					"Title": "Título",
					"Section": "Seção",
					"To opt-in, wrap it.": "Para optar, envolva.",
					"After": "Depois.",
				});

				const file = createTranslationFileFixture({ content: markdown });
				await translatorService.translateContent(file);

				const segmentSources = collectSegmentBatchSources().join("\n");

				expect(segmentSources).toContain("To opt-in, wrap it.");
				expect(segmentSources).not.toContain('// "what" to animate.');
				expect(segmentSources).not.toContain("animate me");
			});

			test("when masking is on, natural language inside a masked large fence never reaches the LLM and is restored verbatim", async () => {
				testEnv.MASK_VERBATIM_LARGE_FENCES = true;
				testEnv.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS = 80;

				const filler = "const x = 1;\n".repeat(400);
				const secretSentence = "ONLY_SENTENCE_THAT_NEED_TRANSLATION";
				const markdown =
					"# Doc\n\n```js\n" + filler + secretSentence + "\n```\n\n## Outro\n\nFinal line.\n";

				mockSegmentAwareTranslation({
					"Doc": "Documento",
					"Outro": "Outro",
					"Final line.": "Linha final.",
				});

				const file = createTranslationFileFixture({ content: markdown });
				const result = await translatorService.translateContent(file);

				const segmentSources = collectSegmentBatchSources().join("\n");

				expect(segmentSources).not.toContain(secretSentence);
				expect(result.content).toContain(secretSentence);
				expect(result.content).toContain("# Doc");
			});

			test("when masking is on, MDX-heavy fixture still uses segment batch on unmasked body", async () => {
				testEnv.MASK_VERBATIM_LARGE_FENCES = true;
				testEnv.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS = 80;

				mockChatCompletionsCreate.mockImplementation((params: unknown) => {
					const userMessage = getUserMessageFromCompletionParams(params);
					const userContent = userMessage?.content ?? "";

					if (isSegmentBatchUserMessage(userContent)) {
						const payload = JSON.parse(userContent) as {
							items: { segmentId: string; source: string }[];
						};

						return Promise.resolve(
							createChatCompletionFixture(
								createSegmentBatchLlmJsonContent(
									payload.items.map((item) => ({
										segmentId: item.segmentId,
										translated: item.source,
									})),
								),
							),
						);
					}

					if (isFrontmatterBatchUserMessage(userContent)) {
						const payload = JSON.parse(userContent) as {
							items: { fieldKey: string; source: string }[];
						};

						return Promise.resolve(
							createChatCompletionFixture(
								JSON.stringify({
									items: payload.items.map((item) => ({
										fieldKey: item.fieldKey,
										translated: item.source,
									})),
								}),
							),
						);
					}

					return Promise.resolve(createChatCompletionFixture(userContent));
				});

				const file = createTranslationFileFixture({ content: hydrateRootMd });
				await translatorService.translateContent(file);

				const usedSegmentBatch = mockChatCompletionsCreate.mock.calls.some(([params]) =>
					chatCallUsedSegmentBatch(params),
				);
				const usedMarkdownDocument = mockChatCompletionsCreate.mock.calls.some(([params]) =>
					chatCallUsedMarkdownDocument(params),
				);

				expect(usedSegmentBatch).toBe(true);
				expect(usedMarkdownDocument).toBe(false);
			});

			test("when masking is on but the threshold is very high, small fenced bodies still stay out of segment batches", async () => {
				testEnv.MASK_VERBATIM_LARGE_FENCES = true;
				testEnv.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS = 50_000;

				const inner = '// "what" to animate.\n<div>animate me</div>\n';
				const markdown = "# Title\n\n```js\n" + inner + "```\n";

				mockSegmentAwareTranslation({
					Title: "Título",
				});

				const file = createTranslationFileFixture({ content: markdown });
				await translatorService.translateContent(file);

				const segmentSources = collectSegmentBatchSources().join("\n");

				expect(segmentSources).not.toContain('// "what" to animate.');
				expect(segmentSources).not.toContain("animate me");
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

			const result = await translatorService.translateContent(file);

			expect(result.content).toContain(translatedContent);
			expect(result.content).toContain("title:");
		});

		test("should warn when code blocks are lost during translation", async () => {
			const sourceContent = `# Title\n\n\`\`\`javascript\nconst x = 1;\n\`\`\`\n\nText\n\n\`\`\`python\nprint("hello")\n\`\`\``;
			const translatedContent = `# Título\n\nTexto traduzido sem blocos de código mas com tamanho similar ao fonte`;

			mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture(translatedContent));

			const file = createTranslationFileFixture({ content: sourceContent });
			const warnSpy = spyOn(file.logger, "warn");
			await translatorService.translateContent(file);
			expect(warnSpy).toHaveBeenCalled();
		});

		test("should warn when code block count differs significantly (>20%)", async () => {
			const sourceContent = `# Title\n\n\`\`\`js\n1\n\`\`\`\n\n\`\`\`js\n2\n\`\`\`\n\n\`\`\`js\n3\n\`\`\`\n\n\`\`\`js\n4\n\`\`\`\n\n\`\`\`js\n5\n\`\`\``;
			const translatedContent = `# Título\n\n\`\`\`js\n1\n\`\`\`\n\n\`\`\`js\n2\n\`\`\`\n\n\`\`\`js\n3\n\`\`\`\n\nTexto extra para manter razão`;

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

			const result = await translatorService.translateContent(file);

			expect(result.content).toContain(translatedContent);
			expect(result.content).toContain("title:");
		});

		test("should ship with reviewer notices when links are lost during translation", async () => {
			const title = "Title";
			const sourceContent = `# Title\n\n[Link 1](https://example.com/1)\n[Link 2](https://example.com/2)\n[Link 3](https://example.com/3)`;
			const translatedContent = `# Título\n\nTexto traduzido sem links mas com conteúdo suficiente para manter a razão de conteúdo aceitável`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);

			const result = await translatorService.translateContent(file);

			expect(result.reviewerNotices.some((n) => n.guardId === "markdownLinksPreserved")).toBe(true);
		});

		test("should ship with reviewer notices when required link URLs are missing", async () => {
			const title = "Title";
			const sourceContent = `# Title\n\n[1](u1) [2](u2) [3](u3) [4](u4) [5](u5)`;
			const translatedContent = `# Título\n\n[1](u1) [2](u2) [3](u3)`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);

			const result = await translatorService.translateContent(file);

			expect(result.reviewerNotices.some((n) => n.guardId === "markdownLinksPreserved")).toBe(true);
		});

		test("should not throw Error when source has no links", () => {
			const title = "Title";
			const sourceContent = `# Title\n\nText without links`;
			const translatedContent = `# Título\n\nTexto sem links`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent }, title);
			expect(translatorService.translateContent(file)).resolves.not.toThrow(ApplicationError);
		});

		test("should not throw Error when every source link URL is preserved", () => {
			const title = "Title";
			const sourceContent = `# Title\n\n[1](u1) [2](u2) [3](u3) [4](u4) [5](u5)`;
			const translatedContent = `# Título\n\n[1](u1) [2](u2) [3](u3) [4](u4) [5](u5)`;

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

			mockSegmentAwareTranslation(
				{ Content: "Conteúdo" },
				createFrontmatterBatchLlmJsonContent("Bem-vindo"),
			);

			const file = createTranslationFileFixture({ content: sourceContent });
			const result = await translatorService.translateContent(file);
			expect(result.content).toContain("Bem-vindo");
			expect(result.content).toContain("Hello");
		});

		test("should preserve original title in YAML when the model returns body without frontmatter", async () => {
			const sourceContent = `---\ntitle: 'Hello'\n---\n\n# Content`;
			const translatedContent = `# Conteúdo`;

			queueOpenAiTranslationResponses(translatedContent);

			const file = createTranslationFileFixture({ content: sourceContent });
			const result = await translatorService.translateContent(file);
			expect(result.content.startsWith("---\n")).toBe(true);
			expect(result.content).toContain("Hello");
			expect(result.content).not.toContain("Olá");
			expect(result.content).toContain("# Conteúdo");
		});

		test("should keep non-translated keys and preserve title when the model emits a shorter YAML block", async () => {
			const sourceContent = `---\ntitle: 'Hello'\ncustom_key: 'value'\nauthor: 'John'\n---\n\n# Content`;
			const translatedBody = `# Conteúdo`;

			queueOpenAiTranslationResponses(translatedBody);

			const file = createTranslationFileFixture({ content: sourceContent });
			const result = await translatorService.translateContent(file);
			expect(result.content).toContain("custom_key: 'value'");
			expect(result.content).toContain("author: 'John'");
			expect(result.content).toContain("# Conteúdo");
			expect(result.content).toContain("Hello");
			expect(result.content).not.toContain("Olá");
		});

		test("should keep long non-translated YAML scalars on one physical line in frontmatter", async () => {
			const longAuthor = "A".repeat(120);
			const sourceContent = `---\ntitle: Hello\nauthor: '${longAuthor}'\n---\n\n# Content`;
			const translatedBody = `# Conteúdo`;

			queueOpenAiTranslationResponses(translatedBody);

			const file = createTranslationFileFixture({ content: sourceContent });
			const result = await translatorService.translateContent(file);

			const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(result.content);
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
			expect(result.content).toContain("Test");
			expect(result.content).not.toContain("Teste");
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

			const result = await translatorService.translateContent(file);

			expect(result.content).toContain("🌍");
			expect(result.content).toContain("àáâãäåæçèéêë");
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

		describe("segment translation", () => {
			test("should translate body via segment batch LLM by default", async () => {
				const body = "# Hello\n\nTranslate me.";

				mockSegmentAwareTranslation({
					"Translate me.": "Traduza-me.",
					"Hello": "Olá",
				});

				const file = createTranslationFileFixture({ content: body });
				const result = await translatorService.translateContent(file);

				expect(result.content).toContain("Traduza-me.");
				expect(result.content).toContain("Olá");

				const segmentBatchCallCount = mockChatCompletionsCreate.mock.calls.filter(([params]) => {
					const userMessage = getUserMessageFromCompletionParams(params);
					return Boolean(userMessage && isSegmentBatchUserMessage(userMessage.content));
				}).length;

				expect(segmentBatchCallCount).toBeGreaterThanOrEqual(1);
			});

			test("should fall back to full-body translation when segment extraction is unsafe", async () => {
				const extractSpy = spyOn(
					segmentMarkdown,
					"extractTranslatableBodySegments",
				).mockReturnValue({
					segments: [],
					parseWarnings: ["parse failed: simulated"],
				});

				mockChatCompletionsCreate.mockResolvedValue(
					createChatCompletionFixture("# Oi\n\nTexto do corpo."),
				);

				const file = createTranslationFileFixture({ content: "# Hi\n\nBody text." });
				const result = await translatorService.translateContent(file);

				expect(result.content).toBe("# Oi\n\nTexto do corpo.");

				const usedSegmentBatch = mockChatCompletionsCreate.mock.calls.some(([params]) => {
					const userMessage = getUserMessageFromCompletionParams(params);
					return Boolean(userMessage && isSegmentBatchUserMessage(userMessage.content));
				});

				expect(usedSegmentBatch).toBe(false);
				extractSpy.mockRestore();
			});

			test("should fall back to full-body translation when segment batch LLM fails", async () => {
				mockChatCompletionsCreate.mockImplementation((params: unknown) => {
					const userMessage = getUserMessageFromCompletionParams(params);
					const userContent = userMessage?.content ?? "";

					if (isSegmentBatchUserMessage(userContent)) {
						return Promise.reject(new Error("segment batch unavailable"));
					}

					return Promise.resolve(createChatCompletionFixture("# Olá\n\nCorpo traduzido."));
				});

				const file = createTranslationFileFixture({ content: "# Hello\n\nBody text." });
				const warnSpy = spyOn(file.logger, "warn");
				const result = await translatorService.translateContent(file);

				expect(result.content).toBe("# Olá\n\nCorpo traduzido.");
				expect(warnSpy).toHaveBeenCalled();
			});

			test("should return body unchanged when there are no translate-kind segments", async () => {
				const codeOnlyBody = "```js\nconst x = 1;\n```\n";

				const file = createTranslationFileFixture({ content: codeOnlyBody });
				const result = await translatorService.translateContent(file);

				expect(result.content).toContain("const x = 1;");
				expect(
					mockChatCompletionsCreate.mock.calls.some(([params]) => {
						const userMessage = getUserMessageFromCompletionParams(params);
						return Boolean(userMessage && isSegmentBatchUserMessage(userMessage.content));
					}),
				).toBe(false);
			});

			test("should split segment batch and retry when completion tokens truncate output", async () => {
				const body = "# Title\n\nAlpha sentence.\n\nBeta sentence.\n\nGamma sentence.";
				let segmentBatchAttempts = 0;

				mockChatCompletionsCreate.mockImplementation((params: unknown) => {
					const userMessage = getUserMessageFromCompletionParams(params);
					const userContent = userMessage?.content ?? "";

					if (!isSegmentBatchUserMessage(userContent)) {
						return Promise.resolve(createChatCompletionFixture(userContent));
					}

					segmentBatchAttempts += 1;
					const payload = JSON.parse(userContent) as {
						items: { segmentId: string; source: string }[];
					};

					if (segmentBatchAttempts === 1 && payload.items.length > 1) {
						return Promise.reject(
							new ApplicationError(
								"Language model response ended at max completion tokens (truncated output)",
								ErrorCode.TranslationFailed,
								"TranslationLlmClient.callLanguageModelSegmentBatch",
							),
						);
					}

					return Promise.resolve(
						createChatCompletionFixture(
							createSegmentBatchLlmJsonContent(
								payload.items.map((item) => ({
									segmentId: item.segmentId,
									translated: `${item.source}[pt]`,
								})),
							),
						),
					);
				});

				const file = createTranslationFileFixture({ content: body });
				const result = await translatorService.translateContent(file);

				expect(segmentBatchAttempts).toBeGreaterThan(1);
				expect(result.content).toContain("[pt]");
			});
		});
	});
});
