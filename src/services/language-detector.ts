import { franc, francAll } from "franc";
import langs from "langs";

/**
 * Configuration for language detection
 */
export interface LanguageConfig {
	source: string;
	target: string;
}

/**
 * Represents the analysis of a language.
 */
export interface LanguageAnalysis {
	languageScore: {
		target: number;
		source: number;
	};
	ratio: number;
	isTranslated: boolean;
	detectedLanguage: string;
}

export class LanguageDetector {
	private readonly MIN_CONTENT_LENGTH = 10;
	private readonly TRANSLATION_THRESHOLD = 0.6;
	private languages: LanguageConfig | null = null;

	/**
	 * Creates a new LanguageDetector instance.
	 *
	 * Converts the source and target languages to ISO 639-3 format for franc compatibility.
	 *
	 * @param config Configuration specifying source and target languages in ISO 639-1 format
	 */
	public constructor(config: LanguageConfig) {
		this.languages = {
			source: langs.where("1", config.source)?.["3"] ?? "eng",
			target: langs.where("1", config.target)?.["3"] ?? "und",
		};
	}

	/**
	 * Determines if the file is translated based on the language analysis.
	 *
	 * @param content The content of the file
	 * @returns `true` if the file is translated, `false` otherwise
	 */
	public isFileTranslated(content: string) {
		return this.analyzeLanguage(content).isTranslated;
	}

	/**
	 * Analyzes the language of the content.
	 *
	 * @param content The content of the file
	 * @returns The language analysis
	 */
	private analyzeLanguage(content: string): LanguageAnalysis {
		if (content.length < this.MIN_CONTENT_LENGTH) {
			return {
				languageScore: {
					target: 0,
					source: 0,
				},
				ratio: 0,
				detectedLanguage: "und",
				isTranslated: false,
			};
		}

		const allDetections = francAll(content) as [string, number][];
		const scores = new Map(allDetections);

		const targetLanguageScore = scores.get("por") ?? 0;
		const sourceLanguageScore = scores.get("eng") ?? 0;
		const detectedLang = franc(content, { minLength: this.MIN_CONTENT_LENGTH });

		// Convert ISO 639-3 to ISO 639-1
		const language = langs.where("3", detectedLang);
		const detectedLanguage = language?.["1"] ?? "und";

		const ratio = targetLanguageScore / (targetLanguageScore + sourceLanguageScore) || 0;

		return {
			languageScore: {
				target: targetLanguageScore,
				source: sourceLanguageScore,
			},
			ratio,
			detectedLanguage,
			isTranslated: this.determineTranslationStatus(ratio, detectedLanguage),
		};
	}

	/**
	 * Determines the translation status based on the ratio and detected language.
	 *
	 * Consider it translated if:
	 * 1. The detected language matches target language
	 * 2. The target language ratio is above the threshold
	 *
	 * @param ratio The ratio of the target language
	 * @param detectedLanguage The detected language
	 * @returns `true` if the file is translated, `false` otherwise
	 */
	private determineTranslationStatus(ratio: number, detectedLanguage: string) {
		return (
			detectedLanguage === langs.where("3", this.languages!.target)?.["1"] ||
			ratio >= this.TRANSLATION_THRESHOLD
		);
	}
}
