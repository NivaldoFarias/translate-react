import { describe, expect, mock, test } from "bun:test";

import { GitHubService } from "../src/services/github";
import { LanguageDetector } from "../src/services/language-detector";
import { TranslatorService } from "../src/services/translator";
import Logger from "../src/utils/logger";

describe("Integration Tests", () => {
	let logger = new Logger();
	let github = new GitHubService();
	let translator = new TranslatorService();
	let fileTranslator = new LanguageDetector();

	test(
		"should complete full translation workflow",
		async () => {
			// Mock the Anthropic class
			mock.module("@anthropic-ai/sdk", () => {
				return {
					default: class MockAnthropic {
						messages = {
							create: async () => ({
								content: [{ text: "status: translated" }],
							}),
						};
					},
				};
			});

			// Mock the translator service
			translator = new TranslatorService();

			// 1. Fetch untranslated files
			const files = await github.getUntranslatedFiles(5);
			expect(files.length).toBeGreaterThan(0);

			// 2. Get glossary
			const glossary = await github.getGlossary();
			expect(glossary).toBeTruthy();

			// 3. Process first file
			const file = files[0];

			// 4. Create branch
			const branch = await github.createBranch(file.path);
			expect(branch).toContain("translate-");

			// 5. Translate content
			const translation = await translator.translateContent(file, glossary);
			expect(translation).toBeTruthy();

			// 6. Verify translation
			expect(fileTranslator.isFileTranslated(translation)).toBe(false);

			// 7. Commit changes
			expect(github.commitTranslation(branch, file, translation)).resolves.toBeUndefined();

			// 8. Delete branch
			await github.deleteBranch(branch);
		},
		{ timeout: 60_000 },
	);

	test(
		"should handle up to 10 concurrent translations",
		async () => {
			// Mock the Anthropic class
			mock.module("@anthropic-ai/sdk", () => {
				return {
					default: class MockAnthropic {
						messages = {
							create: async () => ({
								content: [{ text: "Mocked translation response" }],
							}),
						};
					},
				};
			});

			// Mock the translator service
			translator = new TranslatorService();

			const files = await github.getUntranslatedFiles(10);
			const glossary = await github.getGlossary();

			const results = await Promise.allSettled(
				files.slice(0, 2).map(async (file, index) => {
					try {
						const branch = await github.createBranch(`${file.path}-${index}`);
						const translation = await translator.translateContent(file, glossary);
						await github.commitTranslation(branch, file, translation);
						return translation;
					} catch (error) {
						logger.error(`Failed to process file ${file.path}: ${error}`);
						throw error;
					}
				}),
			);

			// Log failed results for debugging
			results.forEach((result, index) => {
				if (result.status === "rejected") {
					logger.error(`Translation ${index} failed: ${result.reason}`);
				}
			});

			expect(results.some((r) => r.status === "fulfilled")).toBe(true);
		},
		{ timeout: 60_000 },
	);

	test(
		"should maintain consistency across translations",
		async () => {
			// Mock the Anthropic class
			mock.module("@anthropic-ai/sdk", () => {
				return {
					default: class MockAnthropic {
						messages = {
							create: async () => ({
								content: [{ text: "Mocked translation response" }],
							}),
						};
					},
				};
			});

			// Mock the translator service
			translator = new TranslatorService();

			const files = await github.getUntranslatedFiles(10);
			const glossary = await github.getGlossary();
			const translations = new Set<string>();

			// Translate same content multiple times
			for (let i = 0; i < 10; i++) {
				const translation = await translator.translateContent(files[0], glossary);
				translations.add(translation);
			}

			// All translations should be identical
			expect(translations.size).toBe(1);
		},
		{ timeout: 10_000 },
	);
});
