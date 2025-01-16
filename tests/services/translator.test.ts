import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import type { TranslationFile } from "../../src/types";

import { TranslatorService } from "../../src/services/translator";
import { TranslationError } from "../../src/utils/errors";

describe("TranslatorService", () => {
	let translator: TranslatorService;
	const mockGlossary = "React: React\nComponent: Componente";
	const mockFile: TranslationFile = {
		path: "test/file.md",
		content: "This is a test content",
		sha: "test-sha",
	};

	beforeEach(() => {
		translator = new TranslatorService();
	});

	describe("translateContent", () => {
		test("should successfully translate content", async () => {
			const mockTranslation = "Isto é um conteúdo de teste";
			mock.module("@anthropic-ai/sdk", () => ({
				default: class {
					messages = {
						create: async () => ({
							content: [ { text: mockTranslation } ],
						}),
					};
				},
			}));

			const result = await translator.translateContent(mockFile, mockGlossary);
			expect(result).toBe(mockTranslation);
		});

		test("should use cached translation when available", async () => {
			const mockTranslation = "Cached translation";
			const spy = spyOn(translator[ "claude" ].messages, "create");

			// First call to cache the result
			mock.module("@anthropic-ai/sdk", () => ({
				default: class {
					messages = {
						create: async () => ({
							content: [ { text: mockTranslation } ],
						}),
					};
				},
			}));

			await translator.translateContent(mockFile, mockGlossary);

			// Second call should use cache
			const result = await translator.translateContent(mockFile, mockGlossary);

			expect(result).toBe(mockTranslation);
			expect(spy).toHaveBeenCalledTimes(1);
		});

		test("should throw error for empty content", async () => {
			const emptyFile: TranslationFile = {
				path: "test/empty.md",
				content: "",
				sha: "empty-sha",
			};

			await expect(translator.translateContent(emptyFile, mockGlossary)).rejects.toThrow(
				TranslationError,
			);
		});

		test("should retry on failure", async () => {
			let attempts = 0;
			mock.module("@anthropic-ai/sdk", () => ({
				default: class {
					messages = {
						create: async () => {
							if (attempts++ < 2) {
								throw new Error("API Error");
							}
							return {
								content: [ { text: "Success after retry" } ],
							};
						},
					};
				},
			}));

			const result = await translator.translateContent(mockFile, mockGlossary);
			expect(result).toBe("Success after retry");
			expect(attempts).toBe(3);
		});
	});

	describe("metrics", () => {
		test("should track translation metrics", async () => {
			mock.module("@anthropic-ai/sdk", () => ({
				default: class {
					messages = {
						create: async () => ({
							content: [ { text: "Test translation" } ],
						}),
					};
				},
			}));

			await translator.translateContent(mockFile, mockGlossary);
			const metrics = translator.getMetrics();

			expect(metrics.totalTranslations).toBe(1);
			expect(metrics.successfulTranslations).toBe(1);
			expect(metrics.failedTranslations).toBe(0);
			expect(metrics.averageTranslationTime).toBeGreaterThan(0);
		});

		test("should track failed translations", async () => {
			mock.module("@anthropic-ai/sdk", () => ({
				default: class {
					messages = {
						create: async () => {
							throw new Error("API Error");
						},
					};
				},
			}));

			try {
				await translator.translateContent(mockFile, mockGlossary);
			} catch {
				// Expected error
			}

			const metrics = translator.getMetrics();
			expect(metrics.failedTranslations).toBe(1);
			expect(metrics.successfulTranslations).toBe(0);
		});
	});
});
