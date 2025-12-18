import { logger } from "@/utils";

import { CacheService } from "./cache.service";

/** Language detection cache entry structure */
export interface LanguageCacheEntry {
	/** Detected language code (e.g., `"pt"`, `"en"`) */
	detectedLanguage: string;

	/** Confidence score from `0` to `1` */
	confidence: number;

	/** Timestamp when language was detected */
	timestamp: number;
}

/**
 * Specialized cache for language detection results.
 *
 * Caches language detection results keyed by filename and content hash (SHA).
 * Uses a 1-hour TTL sufficient for single workflow runs.
 *
 * @example
 * ```typescript
 * const cache = new LanguageCacheService();
 * cache.set("docs/hello.md", "abc123", {
 *   detectedLanguage: "pt",
 *   confidence: 0.99,
 *   timestamp: Date.now()
 * });
 * ```
 */
export class LanguageCacheService {
	private readonly logger = logger.child({ component: LanguageCacheService.name });
	private readonly cache = new CacheService<LanguageCacheEntry>();

	private static readonly DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

	/**
	 * Stores language detection result in cache.
	 *
	 * @param filename File path/name
	 * @param contentHash Git SHA of the file content
	 * @param entry Language detection results
	 */
	public set(filename: string, contentHash: string, entry: LanguageCacheEntry): void {
		const key = this.buildKey(filename, contentHash);

		this.logger.debug({ key, entry }, "Caching language detection result");

		this.cache.set(key, entry, LanguageCacheService.DEFAULT_TTL_MS);
	}

	/**
	 * Retrieves cached language detection result.
	 *
	 * @param filename File path/name
	 * @param contentHash Git SHA of the file content
	 *
	 * @returns Cached language entry or `null` if not found or expired
	 */
	public get(filename: string, contentHash: string): LanguageCacheEntry | null {
		const key = this.buildKey(filename, contentHash);

		this.logger.debug({ key }, "Retrieving cached language detection result");

		return this.cache.get(key);
	}

	/**
	 * Retrieves multiple cached language detection results in a single operation.
	 *
	 * More efficient than calling `get()` N times.
	 *
	 * @param files Array of file entries with filename and content hash
	 *
	 * @returns Map of filenames to cached language entries (only includes cache hits)
	 */
	public getMany(
		files: { filename: string; contentHash: string }[],
	): Map<string, LanguageCacheEntry> {
		const keys = files.map((file) => this.buildKey(file.filename, file.contentHash));
		const cacheResults = this.cache.getMany(keys);
		const result = new Map<string, LanguageCacheEntry>();

		let keyIndex = 0;
		for (const file of files) {
			const key = keys[keyIndex++];
			if (!key) continue;

			const cached = cacheResults.get(key);

			if (!cached) continue;

			result.set(file.filename, cached);
		}

		this.logger.debug(
			{ requested: files.length, hits: result.size },
			"Retrieved multiple cached language detection results",
		);

		return result;
	}

	/** Clears all language cache entries */
	public clear(): void {
		this.cache.clear();
	}

	/** Returns the number of cached language entries */
	public get size(): number {
		return this.cache.size;
	}

	/**
	 * Builds cache key from filename and content hash.
	 *
	 * Format: `filename:contentHash` ensures uniqueness based on both file
	 * identity and content version.
	 */
	private buildKey(filename: string, contentHash: string): string {
		return `${filename}:${contentHash}`;
	}
}
