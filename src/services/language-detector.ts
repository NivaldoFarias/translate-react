import { franc, francAll } from "franc";
import langs from "langs";

declare interface LanguageAnalysis {
	portugueseScore: number;
	englishScore: number;
	ratio: number;
	isTranslated: boolean;
	detectedLanguage: string;
}

export class LanguageDetector {
	private readonly MIN_CONTENT_LENGTH = 10;
	private readonly TRANSLATION_THRESHOLD = 0.6;

	public isFileTranslated(content: string): boolean {
		return this.analyzeLanguage(content).isTranslated;
	}

	private analyzeLanguage(content: string): LanguageAnalysis {
		if (content.length < this.MIN_CONTENT_LENGTH) {
			return {
				portugueseScore: 0,
				englishScore: 0,
				ratio: 0,
				detectedLanguage: "und",
				isTranslated: false,
			};
		}

		const allDetections = francAll(content) as [string, number][];
		const scores = new Map(allDetections);

		const portugueseScore = scores.get("por") ?? 0;
		const englishScore = scores.get("eng") ?? 0;
		const detectedLang = franc(content, { minLength: this.MIN_CONTENT_LENGTH });

		// Convert ISO 639-3 to ISO 639-1
		const language = langs.where("3", detectedLang);
		const detectedLanguage = language?.["1"] ?? "und";

		const ratio = portugueseScore / (portugueseScore + englishScore) || 0;

		return {
			portugueseScore,
			englishScore,
			ratio,
			detectedLanguage,
			isTranslated: this.determineTranslationStatus(ratio, detectedLanguage),
		};
	}

	private determineTranslationStatus(ratio: number, detectedLanguage: string): boolean {
		// Consider it translated if:
		// 1. The detected language is Portuguese
		// 2. The Portuguese ratio is above the threshold
		return detectedLanguage === "pt" || ratio >= this.TRANSLATION_THRESHOLD;
	}
}
