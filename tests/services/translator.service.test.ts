import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { TranslationFile } from "@/types";

import { TranslatorService } from "@/services/translator.service";

/**
 * Test suite for Translator Service
 * Tests translation operations and content handling
 */
describe("Translator Service", () => {
	let translatorService: TranslatorService;

	beforeEach(() => {
		translatorService = new TranslatorService({
			sourceLanguage: "en",
			targetLanguage: "pt",
		});
	});

	test("should translate content successfully", async () => {
		const mockResponse = {
			choices: [
				{
					message: {
						content: "Olá mundo",
					},
				},
			],
		};

		// Mock OpenAI's chat completion
		const mockOpenAI = {
			chat: {
				completions: {
					create: mock(() => Promise.resolve(mockResponse)),
				},
			},
		};

		// @ts-ignore - Mocking private property
		translatorService.llm = mockOpenAI;

		const file: TranslationFile = {
			path: "test/file.md",
			content: "Hello world",
			sha: "abc123",
			filename: "file.md",
		};

		const translation = await translatorService.translateContent(file);
		expect(translation.choices[0]?.message?.content).toBe("Olá mundo");
	});

	test("should handle empty content", async () => {
		const file: TranslationFile = {
			path: "test/empty.md",
			content: "",
			sha: "def456",
			filename: "empty.md",
		};

		await expect(translatorService.translateContent(file)).rejects.toThrow("File content is empty");
	});

	test("should handle code blocks in content", async () => {
		const mockResponse = {
			choices: [
				{
					message: {
						content: `# Título\n{{BLOCK_0}}\n\nTexto traduzido\n\nBLOCKS TO TRANSLATE\nBLOCK 0:\n\`\`\`js\n// Comentário traduzido\nconst example = "test";\n\`\`\``,
					},
				},
			],
		};

		const mockOpenAI = {
			chat: {
				completions: {
					create: mock(() => Promise.resolve(mockResponse)),
				},
			},
		};

		// @ts-ignore - Mocking private property
		translatorService.llm = mockOpenAI;

		const file: TranslationFile = {
			path: "test/code.md",
			content: `# Title\n\`\`\`js\n// Comment\nconst example = "test";\n\`\`\`\n\nText`,
			sha: "ghi789",
			filename: "code.md",
		};

		const translation = await translatorService.translateContent(file);
		expect(translation.choices[0]?.message?.content).toContain("Título");
		expect(translation.choices[0]?.message?.content).toContain("Comentário traduzido");
		expect(translation.choices[0]?.message?.content).toContain('const example = "test"');
	});

	test("should track translation metrics", async () => {
		const mockResponse = {
			choices: [
				{
					message: {
						content: "Texto traduzido",
					},
				},
			],
		};

		const mockOpenAI = {
			chat: {
				completions: {
					create: mock(() => Promise.resolve(mockResponse)),
				},
			},
		};

		// @ts-ignore - Mocking private property
		translatorService.llm = mockOpenAI;

		const file: TranslationFile = {
			path: "test/metrics.md",
			content: "Text to translate",
			sha: "jkl012",
			filename: "metrics.md",
		};

		await translatorService.translateContent(file);
		const metrics = translatorService.getMetrics();

		expect(metrics.totalTranslations).toBe(1);
		expect(metrics.successfulTranslations).toBe(1);
		expect(metrics.failedTranslations).toBe(0);
		expect(metrics.totalTranslationTime).toBeGreaterThan(0);
	});

	test("should handle translation errors", async () => {
		const mockOpenAI = {
			chat: {
				completions: {
					create: mock(() => Promise.reject(new Error("API Error"))),
				},
			},
		};

		// @ts-ignore - Mocking private property
		translatorService.llm = mockOpenAI;

		const file: TranslationFile = {
			path: "test/error.md",
			content: "Error test",
			sha: "mno345",
			filename: "error.md",
		};

		await expect(translatorService.translateContent(file)).rejects.toThrow("Translation failed");

		const metrics = translatorService.getMetrics();
		expect(metrics.failedTranslations).toBe(1);
	});
});
