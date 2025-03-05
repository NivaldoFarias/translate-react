import { franc, francAll } from "franc";
import langs from "langs";

/**
 * Configuration interface for language detection settings.
 * Uses ISO 639-1 language codes for source and target languages.
 *
 * ## Example
 * ```typescript
 * { sourceLanguage: 'en', targetLanguage: 'pt' }
 * ```
 */
export interface LanguageConfig {
	source: string;
	target: string;
}

/**
 * Detailed analysis of content language detection results.
 *
 * ## Analysis Components
 * - Confidence scores for source and target languages
 * - Ratio of target language presence
 * - Translation status determination
 * - Primary detected language identification
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

/**
 * # Language Detection Service
 *
 * Service for analyzing and detecting the language of content.
 * Helps determine if content needs translation based on language analysis.
 *
 * ## Responsibilities
 * - Language detection and analysis
 * - Translation status determination
 * - Language code conversion
 * - Confidence score calculation
 */
export class LanguageDetector {
	/** Minimum content length required for reliable language detection */
	private readonly MIN_CONTENT_LENGTH = 10;

	/** Threshold ratio above which content is considered translated */
	private readonly TRANSLATION_THRESHOLD = 0.6;

	/** Current language configuration in ISO 639-3 format */
	private languages: LanguageConfig | null = null;

	/**
	 * # Language Detector Constructor
	 *
	 * Initializes a new language detector with source and target languages.
	 * Converts ISO 639-1 codes to ISO 639-3 for compatibility with franc.
	 *
	 * ## Example
	 * ```typescript
	 * const detector = new LanguageDetector({ source: 'en', target: 'pt' });
	 * ```
	 *
	 * @param config - Language configuration with source and target languages
	 */
	public constructor(config: LanguageConfig) {
		this.languages = {
			source: langs.where("1", config.source)?.["3"] ?? "eng",
			target: langs.where("1", config.target)?.["3"] ?? "und",
		};
	}

	/**
	 * # Translation Status Check
	 *
	 * Determines if content is already translated by analyzing its language composition.
	 * Uses language detection and scoring to make the determination.
	 *
	 * ## Example
	 * ```typescript
	 * const isTranslated = detector.isFileTranslated('Olá mundo');
	 * // Returns true if content is in target language
	 * ```
	 *
	 * @param content - Text content to analyze
	 */
	public isFileTranslated(content: string) {
		return this.analyzeLanguage(content).isTranslated;
	}

	/**
	 * # Language Analysis
	 *
	 * Performs detailed language analysis on the content:
	 * 1. Removes code blocks from content
	 * 2. Checks minimum content length
	 * 3. Detects languages and their confidence scores
	 * 4. Calculates target language ratio
	 * 5. Determines translation status
	 *
	 * @param content - Text content to analyze
	 */
	private analyzeLanguage(content: string): LanguageAnalysis {
		const contentWithoutCode = content.replace(/```[\s\S]*?```/g, "");

		if (content.length < this.MIN_CONTENT_LENGTH) {
			return {
				languageScore: { target: 0, source: 0 },
				ratio: 0,
				detectedLanguage: "und",
				isTranslated: false,
			};
		}

		const allDetections = francAll(contentWithoutCode);
		const scores = new Map(allDetections);

		const targetLanguageScore = scores.get(this.languages!.target) ?? 0;
		const sourceLanguageScore = scores.get(this.languages!.source) ?? 0;
		const detectedLang = franc(contentWithoutCode, { minLength: this.MIN_CONTENT_LENGTH });

		const language = langs.where("3", detectedLang);
		const detectedLanguage = language?.["1"] ?? "und";

		const ratio = targetLanguageScore / (targetLanguageScore + sourceLanguageScore) || 0;

		return {
			languageScore: { target: targetLanguageScore, source: sourceLanguageScore },
			ratio,
			detectedLanguage,
			isTranslated: this.determineTranslationStatus(ratio, detectedLanguage),
		};
	}

	/**
	 * # Translation Status Determination
	 *
	 * Evaluates if content should be considered translated based on:
	 * - Match between detected and target language
	 * - Ratio of target language presence
	 *
	 * @param ratio - Target language presence ratio
	 * @param detectedLanguage - Primary detected language
	 */
	private determineTranslationStatus(ratio: number, detectedLanguage: string) {
		return (
			detectedLanguage === langs.where("3", this.languages!.target)?.["1"] ||
			ratio >= this.TRANSLATION_THRESHOLD
		);
	}
}
