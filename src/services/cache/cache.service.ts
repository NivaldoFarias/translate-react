import { logger } from "@/utils";

/** Cache entry with value and expiration timestamp */
export interface CacheEntry<T> {
	/** Cached value */
	value: T;

	/** Expiration timestamp in milliseconds since epoch */
	expiresAt: number;
}

/**
 * Simple in-memory cache service for runtime-scoped data.
 *
 * Provides TTL-based caching with automatic expiration. Uses {@link Map} for O(1)
 * lookups and supports batch operations.
 *
 * @example
 * ```typescript
 * const cache = new CacheService<string>();
 * cache.set("key", "value", 3600000); // 1 hour TTL
 * const cached = cache.get("key"); // ^? "value" | null
 * ```
 */
export class CacheService<T> {
	private readonly logger = logger.child({ component: CacheService.name });
	private cache = new Map<string, CacheEntry<T>>();

	/**
	 * Stores a value in cache with TTL.
	 *
	 * @param key Unique cache key
	 * @param value Value to cache
	 * @param ttlMs Time-to-live in milliseconds
	 */
	public set(key: string, value: T, ttlMs: number): void {
		const expiresAt = Date.now() + ttlMs;

		this.cache.set(key, { value, expiresAt });
	}

	/**
	 * Retrieves a cached value if not expired.
	 *
	 * @param key Cache key to lookup
	 *
	 * @returns Cached value or `null` if expired or not found
	 */
	public get(key: string): T | null {
		this.logger.debug({ key }, "Retrieving cache entry");

		const entry = this.cache.get(key);

		if (!entry) {
			this.logger.debug({ key }, "Cache entry not found");
			return null;
		}

		if (Date.now() > entry.expiresAt) {
			this.logger.debug({ key }, "Cache entry found expired, deleting");
			this.cache.delete(key);
			return null;
		}

		this.logger.debug({ key }, "Cache entry found and valid");

		return entry.value;
	}

	/**
	 * Retrieves multiple cached values in a single operation.
	 *
	 * @param keys Array of cache keys to lookup
	 *
	 * @returns Map of keys to cached values (only includes non-expired entries)
	 */
	public getMany(keys: string[]): Map<string, T> {
		const result = new Map<string, T>();
		const now = Date.now();

		for (const key of keys) {
			const entry = this.cache.get(key);

			if (!entry) continue;

			if (now > entry.expiresAt) {
				this.cache.delete(key);
				continue;
			}

			result.set(key, entry.value);
		}

		this.logger.debug(
			{ keys: keys.length, resultSize: result.size },
			"Retrieved multiple cache entries",
		);

		return result;
	}

	/**
	 * Checks if a key exists and is not expired.
	 *
	 * @param key Cache key to check
	 *
	 * @returns `true` if key exists and not expired
	 */
	public has(key: string): boolean {
		return this.get(key) !== null;
	}

	/**
	 * Removes a specific key from cache.
	 *
	 * @param key Cache key to delete
	 */
	public delete(key: string): void {
		this.logger.debug({ key }, "Deleting cache entry");

		this.cache.delete(key);
	}

	/** Clears all entries from cache */
	public clear(): void {
		this.logger.debug("Clearing all cache entries");

		this.cache.clear();
	}

	/** Returns the current number of cache entries (including expired) */
	public get size(): number {
		return this.cache.size;
	}

	/** Removes all expired entries from cache */
	public cleanupExpired(): number {
		const now = Date.now();
		let removed = 0;

		this.logger.debug("Starting cleanup of expired cache entries");

		for (const [key, entry] of this.cache.entries()) {
			if (now > entry.expiresAt) {
				this.cache.delete(key);
				removed++;
			}
		}

		this.logger.debug({ removed }, "Cleaned up expired cache entries");

		return removed;
	}
}
