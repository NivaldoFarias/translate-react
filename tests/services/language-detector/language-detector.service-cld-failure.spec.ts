import { describe, expect, mock, test } from "bun:test";

import { ApplicationError } from "@/shared/errors/";

const detectMock = mock(() => {
	throw new Error("CLD internal error");
});

void mock.module("cld", () => ({
	default: {
		detect: detectMock,
	},
}));

const { LanguageDetectorService } =
	await import("@/app/services/language-detector/language-detector.service");

describe("LanguageDetectorService CLD failures", () => {
	test("throws ApplicationError after CLD retries exhaust", () => {
		const detector = new LanguageDetectorService();
		const analyzableText =
			"Este é um texto abrangente em português para fins de teste de detecção de idioma confiável.";

		expect(detector.analyzeLanguage("cld-failure.md", analyzableText)).rejects.toThrow(
			ApplicationError,
		);
	});

	test("retries CLD detect before failing closed", async () => {
		detectMock.mockClear();

		const detector = new LanguageDetectorService();
		const analyzableText =
			"Este é um texto abrangente em português para fins de teste de detecção de idioma confiável.";
		const analysisPromise = detector.analyzeLanguage("cld-failure.md", analyzableText);

		expect(analysisPromise).rejects.toThrow(ApplicationError);
		await analysisPromise.catch(() => undefined);

		expect(detectMock).toHaveBeenCalledTimes(3);
	});
});
