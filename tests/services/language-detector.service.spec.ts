import { beforeEach, describe, expect, test } from "bun:test";

import { LanguageDetectorService } from "@/services/";

describe("LanguageDetector", () => {
	let detector: LanguageDetectorService;

	beforeEach(() => {
		detector = new LanguageDetectorService();
	});

	describe("Constructor", () => {
		test("should initialize with valid language configuration from env", () => {
			expect(detector).toBeInstanceOf(LanguageDetectorService);
			expect(detector.detected).toBeInstanceOf(Map);
			expect(LanguageDetectorService.languages).toBeDefined();
			expect(LanguageDetectorService.languages.source).toBeDefined();
			expect(LanguageDetectorService.languages.target).toBeDefined();
		});
	});

	describe("analyzeLanguage", () => {
		test("should analyze English content as not translated", async () => {
			const filename = "test.md";
			const englishText =
				"This is a comprehensive sample English text for reliable language detection purposes.";

			const analysis = await detector.analyzeLanguage(filename, englishText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.languageScore.source).toBeGreaterThan(0);
			expect(analysis.ratio).toBeLessThan(0.5);
		});

		test("should analyze Portuguese content as translated", async () => {
			const filename = "test.md";
			const portugueseText =
				"Este é um texto abrangente em português para fins de teste de detecção de idioma.";

			const analysis = await detector.analyzeLanguage(filename, portugueseText);

			expect(analysis.isTranslated).toBe(true);
			expect(analysis.languageScore.target).toBeGreaterThan(0);
			expect(analysis.ratio).toBeGreaterThan(0.5);
		});

		test("should handle mixed language content appropriately", async () => {
			const filename = "mixed.md";
			const mixedText =
				"This text contains both English and algumas palavras em português para teste.";

			const analysis = await detector.analyzeLanguage(filename, mixedText);

			expect(analysis).toHaveProperty("isTranslated");
			expect(analysis).toHaveProperty("ratio");
			expect(analysis).toHaveProperty("languageScore");
			expect(typeof analysis.isTranslated).toBe("boolean");
			expect(analysis.ratio).toBeGreaterThanOrEqual(0);
			expect(analysis.ratio).toBeLessThanOrEqual(1);
		});

		test("should handle content below minimum length", async () => {
			const filename = "short.md";
			const shortText = "Hi";

			const analysis = await detector.analyzeLanguage(filename, shortText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.ratio).toBe(0);
			expect(analysis.languageScore.source).toBe(0);
			expect(analysis.languageScore.target).toBe(0);
		});

		test("should handle empty text content", async () => {
			const filename = "empty.md";
			const emptyText = "";

			const analysis = await detector.analyzeLanguage(filename, emptyText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.ratio).toBe(0);
			expect(analysis.languageScore).toEqual({ source: 0, target: 0 });
		});

		test("should remove code blocks from analysis", async () => {
			const filename = "code.md";
			const textWithCode = `
Este é um texto abrangente em português brasileiro que contém blocos de código.
O sistema deve ser capaz de detectar corretamente o idioma português, ignorando
completamente o conteúdo dos blocos de código em inglês.
\`\`\`javascript
const foo = async () => { return 'bar'; };
console.log('This should be ignored');
\`\`\`
Mais texto em português brasileiro aqui. A detecção deve funcionar adequadamente
mesmo com a presença deste código em inglês no meio do documento.
			`.trim();

			const analysis = await detector.analyzeLanguage(filename, textWithCode);

			expect(analysis.detectedLanguage).toBeDefined();
			expect(analysis.detectedLanguage).not.toBe("en");
			expect(analysis.languageScore.target).toBeGreaterThan(0);
		});

		test("should store detected language in map", async () => {
			const filename = "store-test.md";
			const text = "This is English text for storage testing purposes.";

			await detector.analyzeLanguage(filename, text);

			expect(detector.detected.has(filename)).toBe(true);
			expect(detector.detected.get(filename)).toBeDefined();
		});
	});

	describe("detectLanguage", () => {
		test("should detect English content when English text is provided", async () => {
			const englishText =
				"This is a comprehensive English text sample for testing language detection purposes.";

			const detected = await detector.detectPrimaryLanguage(englishText);

			expect(detected).toBeDefined();
			expect(detected).toBe("en");
		});

		test("should detect Portuguese content when Portuguese text is provided", async () => {
			const portugueseText =
				"Este é um texto abrangente em português brasileiro para fins de teste de detecção de idioma com conteúdo suficiente.";

			const detected = await detector.detectPrimaryLanguage(portugueseText);

			expect(detected).toBeDefined();
			expect(detected).not.toBe("en");
			expect(detected).not.toBe("und");
		});

		test("should return undefined for invalid language code", async () => {
			const result = await detector.detectPrimaryLanguage("invalid");

			expect(result).toBeUndefined();
		});
	});

	describe("Edge Cases and Error Handling", () => {
		test("should handle special characters in content", async () => {
			const filename = "special.md";
			const textWithSpecialChars =
				"Este texto em português brasileiro contém acentuação especial: ação, coração, não, são, informação, educação, tradução, programação, aplicação.";

			const analysis = await detector.analyzeLanguage(filename, textWithSpecialChars);

			expect(analysis).toBeDefined();
			expect(analysis.detectedLanguage).toBeDefined();
			expect(analysis.detectedLanguage).not.toBe("en");
		});

		test("should handle numeric content", async () => {
			const filename = "numbers.md";
			const numericText = "123 456 789 0 1234567890";

			const analysis = await detector.analyzeLanguage(filename, numericText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.ratio).toBe(0);
		});

		test("should handle URLs and email addresses", async () => {
			const filename = "urls.md";
			const textWithUrls =
				"Visit https://example.com or email test@example.com for more information.";

			const analysis = await detector.analyzeLanguage(filename, textWithUrls);

			expect(analysis).toBeDefined();
			expect(typeof analysis.isTranslated).toBe("boolean");
		});

		test("should handle whitespace-only content", async () => {
			const filename = "whitespace.md";
			const whitespaceText = "   \n\t\t\n   ";

			const analysis = await detector.analyzeLanguage(filename, whitespaceText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.ratio).toBe(0);
		});

		test("should handle very long content efficiently", async () => {
			const filename = "long.md";
			const longText = "Este é um texto em português. ".repeat(1000);

			const analysis = await detector.analyzeLanguage(filename, longText);

			expect(analysis).toBeDefined();
			expect(analysis.detectedLanguage).toBeDefined();
		});

		test("should handle content with only punctuation", async () => {
			const filename = "punctuation.md";
			const punctuationText = "!@#$%^&*()_+-={}[]|\\:;\"'<>?,./";

			const analysis = await detector.analyzeLanguage(filename, punctuationText);

			expect(analysis.isTranslated).toBe(false);
			expect(analysis.ratio).toBe(0);
		});
	});
});
