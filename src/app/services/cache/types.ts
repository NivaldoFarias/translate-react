/** Language detection cache entry */
export interface LanguageCacheEntry {
	/** Detected language code (e.g. `"pt"`, `"en"`) */
	detectedLanguage: string;

	/** Confidence score from `0` to `1` */
	confidence: number;

	/** Timestamp when language was detected */
	timestamp: number;
}
