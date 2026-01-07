import cld from "cld";

import type { ReactLanguageCode } from "@/utils/";

import { env, logger, REACT_TRANSLATION_LANGUAGES } from "@/utils/";

/**
 * Configuration interface for language detection settings.
 *
 * Uses React translation language codes for source and target languages.
 * Only the 38 official React translation languages are supported.
 *
 * @example
 * ```typescript
 * const config: LanguageConfig = {
 * 	source: "en",
 * 	target: "pt-br"
 * };
 * ```
 */
export interface LanguageConfig {
	source: ReactLanguageCode;
	target: ReactLanguageCode;
}

/**
 * Detailed analysis of content language detection results.
 *
 * Contains confidence scores, ratios, and detection metadata for language
 * analysis operations.
 */
export interface LanguageAnalysis {
	/** Confidence scores for source and target languages, on a scale from 0 to 1 */
	languageScore: {
		/**
		 * Confidence scores for target languages, on a scale from 0 to 1
		 *
		 * @example 0.98
		 */
		target: number;

		/**
		 * Confidence scores for source languages, on a scale from 0 to 1
		 *
		 * @example 0.02
		 */
		source: number;
	};

	/** Ratio of target language presence in content */
	ratio: number;

	/** Indicates if content is considered translated */
	isTranslated: boolean;

	/** Primary detected language code (e.g., "en", "pt") */
	detectedLanguage: string | undefined;

	/** Raw CLD detection result for advanced usage */
	rawResult: cld.DetectLanguage;
}

/**
 * React-aware language detection service using Google's CLD2 (Compact Language Detector).
 *
 * Provides async language analysis specifically for React documentation translation
 * workflows. Validates against the 38 official React translation languages and uses
 * {@link Intl.DisplayNames} for human-readable language names with 100% coverage.
 *
 * @example
 * ```typescript
 * const detector = new LanguageDetector();
 * const analysis = await detector.analyzeLanguage('readme.md', 'Hello world');
 * console.log(analysis.isTranslated); // false
 * ```
 */
export class LanguageDetectorService {
	private readonly logger = logger.child({ component: LanguageDetectorService.name });

	/** Minimum content length required for reliable language detection */
	private readonly MIN_CONTENT_LENGTH = 10;

	/** Threshold ratio above which content is considered translated */
	private readonly TRANSLATION_THRESHOLD = 0.5;

	/** Current language configuration using React language codes */
	public readonly languages: LanguageConfig = {
		source: env.SOURCE_LANGUAGE,
		target: env.TARGET_LANGUAGE,
	};

	/** {@link Intl.DisplayNames} instance for human-readable language names */
	private readonly displayNames = new Intl.DisplayNames(["en"], { type: "language" });

	/**
	 * Cache of previously detected languages to avoid redundant CLD calls.
	 * Maps content hashes to detected language codes.
	 */
	public detected = new Map<string, string | undefined>();

	/**
	 * Gets the human-readable display name for a React language code.
	 *
	 * Uses {@link Intl.DisplayNames} for automatic localization support. Only works with
	 * the 38 supported React translation languages.
	 *
	 * @param code React language code (e.g., `"en"`, `"pt-br"`, `"zh-hans"`)
	 *
	 * @returns Human-readable language name or `undefined` if not a supported React language
	 *
	 * @example
	 * ```typescript
	 * detector.getLanguageName('pt-br'); 	// "Brazilian Portuguese"
	 * detector.getLanguageName('zh-hans'); // "Simplified Chinese"
	 * detector.getLanguageName('invalid'); // undefined
	 * ```
	 */
	public getLanguageName(code: string): string | undefined {
		if (!REACT_TRANSLATION_LANGUAGES.includes(code)) {
			return undefined;
		}

		try {
			const name = this.displayNames.of(code);

			return name !== code ? name : undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Performs comprehensive language analysis on content using Google's CLD2 library.
	 *
	 * Analyzes text content to determine translation status by comparing confidence scores
	 * between source and target languages. The method preprocesses content by removing
	 * code blocks and technical elements, performs CLD detection, calculates language
	 * confidence scores, and determines translation status based on configurable thresholds.
	 *
	 * The analysis workflow includes:
	 * 1. **Content validation**: Ensures minimum content length for reliable detection
	 * 2. **Content preprocessing**: Removes code blocks and technical content via `cleanContent()`
	 * 3. **Language detection**: Uses CLD2 to detect all languages present in content
	 * 4. **Score calculation**: Computes confidence scores for source and target languages
	 * 5. **Translation determination**: Applies threshold ratio to determine translation status
	 * 6. **Result caching**: Stores detected language for performance optimization
	 *
	 * @param filename Identifier for the content being analyzed (used for caching results)
	 * @param content Text content to analyze for language detection and translation status
	 *
	 * @returns Resolves to a detailed {@link LanguageAnalysis} with confidence scores,
	 *   translation status, detected language, and raw CLD results
	 *
	 * @example
	 * ```typescript
	 * const detector = new LanguageDetector({ source: 'en', target: 'pt-br' });
	 * const analysis = await detector.analyzeLanguage('readme.md', 'Olá mundo');
	 *
	 * console.log(analysis.isTranslated); 			// true
	 * console.log(analysis.ratio); 						// 0.85 (85% target language confidence)
	 * console.log(analysis.detectedLanguage); 	// "pt"
	 * ```
	 *
	 * @see {@link cleanContent} for content preprocessing logic
	 * @see {@link findLanguageScore} for confidence score calculation
	 */
	public async analyzeLanguage(filename: string, content: string): Promise<LanguageAnalysis> {
		if (!content || content.length < this.MIN_CONTENT_LENGTH) {
			return {
				languageScore: { target: 0, source: 0 },
				ratio: 0,
				isTranslated: false,
				detectedLanguage: "und",
				rawResult: {
					reliable: false,
					languages: [],
					textBytes: content.length,
					chunks: [],
				},
			};
		}

		const cleanContent = this.cleanContent(content);

		try {
			const detection = await cld.detect(cleanContent);

			const primaryLanguage = detection.languages[0];
			const detectedLanguage = primaryLanguage?.code ?? "und";

			const targetScore = this.findLanguageScore(detection.languages, this.languages.target);
			const sourceScore = this.findLanguageScore(detection.languages, this.languages.source);

			const ratio = targetScore / (targetScore + sourceScore || 1);

			const isTranslated = ratio > this.TRANSLATION_THRESHOLD;

			this.detected.set(filename, detectedLanguage);

			return {
				languageScore: {
					target: targetScore,
					source: sourceScore,
				},
				ratio,
				isTranslated,
				detectedLanguage,
				rawResult: detection,
			};
		} catch {
			return {
				languageScore: { target: 0, source: 0 },
				ratio: 0,
				isTranslated: false,
				detectedLanguage: "und",
				rawResult: {
					reliable: false,
					languages: [],
					textBytes: content.length,
					chunks: [],
				},
			};
		}
	}

	/**
	 * Detects the primary language of text content.
	 *
	 * @param text Text content to analyze
	 *
	 * @returns Resolves to the detected language code or undefined
	 */
	public async detectPrimaryLanguage(text: string): Promise<string | undefined> {
		if (!text || text.length < this.MIN_CONTENT_LENGTH) {
			return undefined;
		}

		try {
			const cleanContent = this.cleanContent(text);
			const detection = await cld.detect(cleanContent);
			return detection.languages[0]?.code ?? "und";
		} catch {
			return undefined;
		}
	}

	/**
	 * Removes code blocks and technical content from text for better language detection.
	 *
	 * @param content Raw content to clean
	 *
	 * @returns Cleaned content suitable for language detection
	 */
	private cleanContent(content: string): string {
		const regexes = {
			codeBlock: /```[\s\S]*?```/g,
			inlineCode: /`[^`]*`/g,
			htmlTags: /<[^>]*>/g,
			urls: /https?:\/\/[^\s]+/g,
			whitespace: /\s+/g,
		} as const;

		return content
			.replace(regexes.codeBlock, " ")
			.replace(regexes.inlineCode, " ")
			.replace(regexes.htmlTags, " ")
			.replace(regexes.urls, " ")
			.replace(regexes.whitespace, " ")
			.trim();
	}

	/**
	 * Maps React language codes to CLD language codes.
	 * CLD uses standard ISO codes while React uses locale-specific codes.
	 *
	 * @param reactCode React language code (e.g., `"pt-br"`, `"zh-hans"`)
	 *
	 * @returns Array of possible CLD language codes corresponding to the React code
	 *
	 * @example
	 * ```typescript
	 * this.mapToCldCode('pt-br');
	 * // ^? ['pt', 'pt-br']
	 * ```
	 */
	private mapToCldCode(reactCode: string): string[] {
		const mapping: Record<string, string[]> = {
			"pt-br": ["pt", "pt-br"],
			"zh-hans": ["zh", "zh-cn", "zh-hans"],
			"zh-hant": ["zh", "zh-tw", "zh-hant"],
		};

		return mapping[reactCode] ?? [reactCode];
	}

	/**
	 * Finds the confidence score for a specific language in CLD results.
	 * Handles mapping between React language codes and CLD codes.
	 *
	 * @param detectedLanguages Array of detected languages from CLD
	 * @param targetLanguageCode Target language code to find
	 *
	 * @returns Confidence score (0-1) for the target language
	 */
	private findLanguageScore(detectedLanguages: cld.Language[], targetLanguageCode: string): number {
		const possibleCodes = this.mapToCldCode(targetLanguageCode);

		for (const code of possibleCodes) {
			const lang = detectedLanguages.find((lang) => lang.code === code);
			if (lang) {
				return lang.percent / 100;
			}
		}

		return 0;
	}
}
