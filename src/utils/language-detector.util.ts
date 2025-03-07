import { franc, francAll } from "franc";
import langs from "langs";

import type { Type as LangsType } from "langs";

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
	detectedLanguage: ReturnType<typeof langs.where>;
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
	private readonly TRANSLATION_THRESHOLD = 0.5;

	/** Current language configuration in ISO 639-3 format */
	private readonly languages: LanguageConfig;

	/** Map of detected languages by filename */
	public detected: Map<string, ReturnType<typeof langs.where>> = new Map();

	/**
	 * Initializes a new language detector with source and target languages.
	 * Converts ISO 639-1 codes to ISO 639-3 for compatibility with franc.
	 *
	 * @param config Language configuration with source and target languages
	 *
	 * @example
	 * ```typescript
	 * const detector = new LanguageDetector({ source: 'en', target: 'pt' });
	 * ```
	 */
	public constructor(config: LanguageConfig) {
		const source = this.detectLanguage(config.source, "1");
		const target = this.detectLanguage(config.target, "1");

		if (!source || !target) {
			throw new Error(`Invalid language code: ${config.source} or ${config.target}`);
		}

		this.languages = {
			source: source["3"],
			target: target["3"],
		};
	}

	/**
	 * Performs detailed language analysis on the content:
	 * 1. Removes code blocks from content
	 * 2. Checks minimum content length
	 * 3. Detects languages and their confidence scores
	 * 4. Calculates target language ratio
	 * 5. Determines translation status
	 *
	 * @param filename Filename of the content
	 * @param content Text content to analyze
	 *
	 * @returns Language analysis results
	 *
	 * @example
	 * ```typescript
	 * const analysis = detector.analyzeLanguage('Olá mundo');
	 * ```
	 */
	public analyzeLanguage(filename: string, content: string): LanguageAnalysis {
		const contentWithoutCode = content.replace(/```[\s\S]*?```/g, "");

		if (content.length < this.MIN_CONTENT_LENGTH) {
			return {
				languageScore: { target: 0, source: 0 },
				ratio: 0,
				detectedLanguage: this.detectLanguage("und"),
				isTranslated: false,
			};
		}

		const allDetections = francAll(contentWithoutCode);
		const scores = new Map(allDetections);

		const targetLanguageScore = scores.get(this.languages.target) ?? 0;
		const sourceLanguageScore = scores.get(this.languages.source) ?? 0;
		const detectedLang = franc(contentWithoutCode, { minLength: this.MIN_CONTENT_LENGTH });

		const detectedLanguage = this.detectLanguage(detectedLang);

		this.detected.set(filename, detectedLanguage);

		const ratio = targetLanguageScore / (targetLanguageScore + sourceLanguageScore) || 0;

		return {
			languageScore: { target: targetLanguageScore, source: sourceLanguageScore },
			ratio,
			detectedLanguage,
			isTranslated:
				targetLanguageScore === 1 || this.determineTranslationStatus(ratio, detectedLanguage),
		};
	}

	/**
	 * Evaluates if content should be considered translated based on:
	 * - Match between detected and target language
	 * - Ratio of target language presence
	 *
	 * @param ratio Target language presence ratio
	 * @param detectedLanguage Primary detected language
	 *
	 * @returns `true` if content should be considered translated, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * const isTranslated = detector.determineTranslationStatus(0.7, 'pt');
	 * ```
	 */
	private determineTranslationStatus(
		ratio: number,
		detectedLanguage: ReturnType<typeof langs.where>,
	) {
		return (
			(detectedLanguage && Object.values(detectedLanguage).includes(this.languages.target)) ||
			ratio >= this.TRANSLATION_THRESHOLD
		);
	}

	public detectLanguage(language: string, type: LangsType = "3") {
		return langs.where(type, language);
	}
}
