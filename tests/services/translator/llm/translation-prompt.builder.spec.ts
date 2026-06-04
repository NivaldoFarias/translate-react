import { describe, expect, test } from "bun:test";

import { localeService } from "@/app/composition";
import { TranslationPromptBuilder } from "@/app/services/translator/llm/translation-prompt.builder";
import { translationAttemptContextFromMaintainerReview } from "@/app/services/translator/pipeline/translation-attempt.context";
import { TranslationFile } from "@/app/services/translator/translation-file";

import { createMockLanguageDetectorService } from "@tests/mocks";

describe("TranslationPromptBuilder", () => {
	test("buildMaintainerReviewSection explains maintainer feedback and includes comment bodies", () => {
		const languageDetector = createMockLanguageDetectorService();
		const builder = new TranslationPromptBuilder(languageDetector as never, localeService);
		const maintainerComment = "Use sentence case in the troubleshooting heading.";

		const section = builder.buildMaintainerReviewSection(
			translationAttemptContextFromMaintainerReview([maintainerComment]),
		);

		expect(section).toContain("MAINTAINER REVIEW");
		expect(section).toContain("maintainer reviewed the last automated translation");
		expect(section).toContain(maintainerComment);
	});

	test("buildMarkdownDocumentSystemPrompt includes maintainer review before validation retry section", () => {
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
			attemptContext: translationAttemptContextFromMaintainerReview(["Fix the heading case."]),
			translationGuidelines: null,
		});

		const maintainerIndex = prompt.indexOf("MAINTAINER REVIEW");
		const validationIndex = prompt.indexOf("CORRECTION REQUIRED");

		expect(maintainerIndex).toBeGreaterThan(-1);
		expect(prompt).toContain("Fix the heading case.");
		expect(validationIndex).toBe(-1);
		expect(maintainerIndex).toBeLessThan(prompt.indexOf("CRITICAL PRESERVATION"));
	});
});
