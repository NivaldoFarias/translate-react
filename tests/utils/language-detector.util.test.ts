import { describe, expect, test } from "bun:test";

import { LanguageDetector } from "@/utils/language-detector.util";

/**
 * Test suite for Language Detector Utility
 * Tests language detection and translation status functionality
 */
describe("Language Detector Utility", () => {
	const detector = new LanguageDetector({
		sourceLanguage: "en",
		targetLanguage: "pt",
	});

	test("should detect English content as not translated", () => {
		const text = "This is a sample English text for testing purposes.";
		expect(detector.isFileTranslated(text)).toBe(false);
	});

	test("should detect Portuguese content as translated", () => {
		const text = "Este é um texto em português para fins de teste.";
		expect(detector.isFileTranslated(text)).toBe(true);
	});

	test("should handle mixed language content", () => {
		const text = "This is mixed content com algumas palavras em português.";
		const isTranslated = detector.isFileTranslated(text);
		expect(typeof isTranslated).toBe("boolean");
	});

	test("should handle empty text", () => {
		const emptyText = "";
		expect(detector.isFileTranslated(emptyText)).toBe(false);
	});

	test("should handle short text below minimum length", () => {
		const shortText = "Hi";
		expect(detector.isFileTranslated(shortText)).toBe(false);
	});

	test("should handle code snippets appropriately", () => {
		const codeSnippet = "const foo = () => { return 'bar'; };";
		expect(detector.isFileTranslated(codeSnippet)).toBe(false);
	});
});
