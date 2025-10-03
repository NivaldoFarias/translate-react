/**
 * @fileoverview Tests for the {@link LanguageDetector} service.
 *
 * This suite covers language detection, translation analysis, and edge cases
 * for content language processing in the translation workflow.
 */

import { beforeEach, describe, expect, test } from "bun:test";

import type { LanguageConfig } from "@/services/language-detector.service";

import { LanguageDetector } from "@/services/language-detector.service";

describe("LanguageDetector", () => {
	let detector: LanguageDetector;
	const defaultConfig: LanguageConfig = {
		source: "en",
		target: "pt",
	};

	beforeEach(() => {
		detector = new LanguageDetector(defaultConfig);
	});

	describe("Constructor", () => {
		test("should initialize with valid language configuration", () => {
			expect(detector).toBeInstanceOf(LanguageDetector);
			expect(detector.detected).toBeInstanceOf(Map);
		});

		test("should throw error for invalid source language code", () => {
			expect(() => {
				new LanguageDetector({ source: "invalid", target: "pt" });
			}).toThrow("Invalid language code: invalid or pt");
		});

		test("should throw error for invalid target language code", () => {
			expect(() => {
				new LanguageDetector({ source: "en", target: "invalid" });
			}).toThrow("Invalid language code: en or invalid");
		});
	});

	describe("analyzeLanguage", () => {
		test("should analyze English content as not translated", () => {
			const filename = "test.md";
			const englishText =
				"This is a comprehensive sample English text for reliable language detection purposes.";

			const analysis = detector.analyzeLanguage(filename, englishText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.languageScore.source).toBeGreaterThan(0);
			expect(analysis.ratio).toBeLessThan(0.5);
		});

		test("should analyze Portuguese content as translated", () => {
			const filename = "test.md";
			const portugueseText =
				"Este é um texto abrangente em português para fins de teste de detecção de idioma.";

			const analysis = detector.analyzeLanguage(filename, portugueseText);

			expect(analysis.isTranslated).toBe(true);
			expect(analysis.languageScore.target).toBeGreaterThan(0);
			expect(analysis.ratio).toBeGreaterThan(0.5);
		});

		test("should handle mixed language content appropriately", () => {
			const filename = "mixed.md";
			const mixedText =
				"This text contains both English and algumas palavras em português para teste.";

			const analysis = detector.analyzeLanguage(filename, mixedText);

			expect(analysis).toHaveProperty("isTranslated");
			expect(analysis).toHaveProperty("ratio");
			expect(analysis).toHaveProperty("languageScore");
			expect(typeof analysis.isTranslated).toBe("boolean");
			expect(analysis.ratio).toBeGreaterThanOrEqual(0);
			expect(analysis.ratio).toBeLessThanOrEqual(1);
		});

		test("should handle content below minimum length", () => {
			const filename = "short.md";
			const shortText = "Hi";

			const analysis = detector.analyzeLanguage(filename, shortText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.ratio).toBe(0);
			expect(analysis.languageScore.source).toBe(0);
			expect(analysis.languageScore.target).toBe(0);
		});

		test("should handle empty text content", () => {
			const filename = "empty.md";
			const emptyText = "";

			const analysis = detector.analyzeLanguage(filename, emptyText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.ratio).toBe(0);
			expect(analysis.languageScore).toEqual({ source: 0, target: 0 });
		});

		test("should remove code blocks from analysis", () => {
			const filename = "code.md";
			const textWithCode = `
Este é um texto em português.
\`\`\`javascript
const foo = () => { return 'bar'; };
console.log('This should be ignored');
\`\`\`
Mais texto em português aqui.
			`.trim();

			const analysis = detector.analyzeLanguage(filename, textWithCode);

			expect(analysis.isTranslated).toBe(true);
			expect(analysis.languageScore.target).toBeGreaterThan(0);
		});

		test("should store detected language in map", () => {
			const filename = "store-test.md";
			const text = "This is English text for storage testing purposes.";

			detector.analyzeLanguage(filename, text);

			expect(detector.detected.has(filename)).toBe(true);
			expect(detector.detected.get(filename)).toBeDefined();
		});
	});

	describe("detectLanguage", () => {
		test("should detect language by ISO 639-1 code", () => {
			const english = detector.detectLanguage("en", "1");
			const portuguese = detector.detectLanguage("pt", "1");

			expect(english).toBeDefined();
			expect(portuguese).toBeDefined();
			expect(english?.["1"]).toBe("en");
			expect(portuguese?.["1"]).toBe("pt");
		});

		test("should detect language by ISO 639-3 code (default)", () => {
			const english = detector.detectLanguage("eng");
			const portuguese = detector.detectLanguage("por");

			expect(english).toBeDefined();
			expect(portuguese).toBeDefined();
			expect(english?.["3"]).toBe("eng");
			expect(portuguese?.["3"]).toBe("por");
		});

		test("should return undefined for invalid language code", () => {
			const result = detector.detectLanguage("invalid");

			expect(result).toBeUndefined();
		});
	});

	describe("Edge Cases and Error Handling", () => {
		test("should handle special characters in content", () => {
			const filename = "special.md";
			const textWithSpecialChars = "Texto com acentuação: ação, coração, não, são.";

			const analysis = detector.analyzeLanguage(filename, textWithSpecialChars);

			expect(analysis).toBeDefined();
			expect(analysis.isTranslated).toBe(true);
		});

		test("should handle numeric content", () => {
			const filename = "numbers.md";
			const numericText = "123 456 789 0 1234567890";

			const analysis = detector.analyzeLanguage(filename, numericText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.ratio).toBe(0);
		});

		test("should handle URLs and email addresses", () => {
			const filename = "urls.md";
			const textWithUrls =
				"Visit https://example.com or email test@example.com for more information.";

			const analysis = detector.analyzeLanguage(filename, textWithUrls);

			expect(analysis).toBeDefined();
			expect(typeof analysis.isTranslated).toBe("boolean");
		});
	});
});
