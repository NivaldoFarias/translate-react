import { describe, expect, test } from "bun:test";

import { localeService } from "@/app/composition";
import { ruLocale } from "@/app/locales";
import { LocaleService } from "@/app/locales/locale.service";
import { TranslationPromptBuilder } from "@/app/services/translator/llm/translation-prompt.builder";
import { emptyTranslationAttemptContext } from "@/app/services/translator/pipeline/translation-attempt.context";
import { TranslationFile } from "@/app/services/translator/translation-file";

import { createMockLanguageDetectorService } from "@tests/mocks";

describe("TranslationPromptBuilder", () => {
	test("buildMarkdownDocumentSystemPrompt includes preservation rules", () => {
		const languageDetector = createMockLanguageDetectorService();
		const builder = new TranslationPromptBuilder(languageDetector as never, localeService);
		const file = new TranslationFile(
			"## Hello\n\nBody.",
			"hello.md",
			"src/content/hello.md",
			"sha",
		);

		const prompt = builder.buildSystemPrompt({
			file,
			userMessageContent: file.content,
			attemptContext: emptyTranslationAttemptContext(),
			translationGuidelines: null,
		});

		expect(prompt).toContain("CRITICAL PRESERVATION RULES");
		expect(prompt).not.toContain("MAINTAINER REVIEW");
	});

	test("buildSegmentBatchSystemPrompt omits MDN rewrite rules for ru segment batches", () => {
		const languageDetector = createMockLanguageDetectorService();
		const ruLocaleService = new LocaleService("ru");
		const builder = new TranslationPromptBuilder(languageDetector as never, ruLocaleService);

		const prompt = builder.buildSegmentBatchSystemPrompt(
			{ source: "English", target: "Русский" },
			null,
		);

		expect(prompt).toContain("SEGMENT BATCH CONTEXT");
		expect(prompt).toContain("серверные компоненты");
		expect(prompt).not.toContain("developer.mozilla.org/en-US/docs");
		expect(ruLocale.rules.specific).toContain("developer.mozilla.org/ru/docs");
	});
});
