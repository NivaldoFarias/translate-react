import { describe, expect, test } from "bun:test";

import { localeService } from "@/app/composition";
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
});
