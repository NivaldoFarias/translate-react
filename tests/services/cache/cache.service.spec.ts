import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { CacheService } from "@/services/";

/** Creates a cache with a fake clock for deterministic TTL tests (no sleep). */
function createCacheWithFakeClock(): {
	cache: CacheService<string>;
	advanceMs: (ms: number) => void;
} {
	let now = 0;
	const cache = new CacheService<string>({
		getNow: () => now,
	});
	return {
		cache,
		advanceMs: (ms: number) => {
			now += ms;
		},
	};
}

describe("CacheService", () => {
	let cache: CacheService<string>;

	beforeEach(() => {
		cache = new CacheService<string>();
	});

	afterEach(() => {
		cache.clear();
	});

	describe("set and get", () => {
		test("should store and retrieve value when valid key is provided", () => {
			cache.set("key1", "value1", 1000);

			const result = cache.get("key1");

			expect(result).toBe("value1");
		});

		test("should return null when key does not exist in cache", () => {
			const result = cache.get("nonexistent");

			expect(result).toBeNull();
		});

		test("should return null when cached value has expired", () => {
			const { cache: clockedCache, advanceMs } = createCacheWithFakeClock();

			clockedCache.set("key1", "value1", 50);
			advanceMs(100);

			const result = clockedCache.get("key1");

			expect(result).toBeNull();
		});

		test("should automatically remove expired entry when accessed", () => {
			const { cache: clockedCache, advanceMs } = createCacheWithFakeClock();

			clockedCache.set("key1", "value1", 50);
			expect(clockedCache.size).toBe(1);

			advanceMs(100);
			clockedCache.get("key1");

			expect(clockedCache.size).toBe(0);
		});
	});

	describe("getMany", () => {
		test("should retrieve multiple cached values when all keys exist", () => {
			cache.set("key1", "value1", 1000);
			cache.set("key2", "value2", 1000);
			cache.set("key3", "value3", 1000);

			const results = cache.getMany(["key1", "key2", "key3"]);

			expect(results.size).toBe(3);
			expect(results.get("key1")).toBe("value1");
			expect(results.get("key2")).toBe("value2");
			expect(results.get("key3")).toBe("value3");
		});

		test("should exclude non-existent keys when some keys are not cached", () => {
			cache.set("key1", "value1", 1000);

			const results = cache.getMany(["key1", "key2", "key3"]);

			expect(results.size).toBe(1);
			expect(results.get("key1")).toBe("value1");
			expect(results.has("key2")).toBe(false);
		});

		test("should exclude expired entries when retrieving multiple values", () => {
			const { cache: clockedCache, advanceMs } = createCacheWithFakeClock();

			clockedCache.set("key1", "value1", 60_000);
			clockedCache.set("key2", "value2", 1);
			advanceMs(50);

			const results = clockedCache.getMany(["key1", "key2"]);

			expect(results.size).toBe(1);
			expect(results.get("key1")).toBe("value1");
			expect(results.has("key2")).toBe(false);
		});

		test("should return empty map when keys array is empty", () => {
			const results = cache.getMany([]);

			expect(results.size).toBe(0);
		});
	});

	describe("has", () => {
		test("should return true when key exists and has not expired", () => {
			cache.set("key1", "value1", 1000);

			const result = cache.has("key1");

			expect(result).toBe(true);
		});

		test("should return false when key does not exist", () => {
			const result = cache.has("nonexistent");

			expect(result).toBe(false);
		});

		test("should return false when key has expired beyond TTL", () => {
			const { cache: clockedCache, advanceMs } = createCacheWithFakeClock();

			clockedCache.set("key1", "value1", 50);
			advanceMs(100);

			const result = clockedCache.has("key1");

			expect(result).toBe(false);
		});
	});

	describe("delete", () => {
		test("should remove specific key when key exists in cache", () => {
			cache.set("key1", "value1", 1000);
			cache.set("key2", "value2", 1000);

			cache.delete("key1");

			expect(cache.get("key1")).toBeNull();
			expect(cache.get("key2")).toBe("value2");
			expect(cache.size).toBe(1);
		});

		test("should handle gracefully when deleting non-existent key", () => {
			cache.delete("nonexistent");

			expect(cache.size).toBe(0);
		});
	});

	describe("clear", () => {
		test("should remove all entries when cache contains multiple items", () => {
			cache.set("key1", "value1", 1000);
			cache.set("key2", "value2", 1000);
			cache.set("key3", "value3", 1000);

			cache.clear();

			expect(cache.size).toBe(0);
			expect(cache.get("key1")).toBeNull();
			expect(cache.get("key2")).toBeNull();
		});
	});

	describe("cleanupExpired", () => {
		test("should remove all expired entries when some entries have exceeded TTL", () => {
			const { cache: clockedCache, advanceMs } = createCacheWithFakeClock();

			clockedCache.set("key1", "value1", 60_000);
			clockedCache.set("key2", "value2", 150);
			clockedCache.set("key3", "value3", 50);
			advanceMs(500);

			const removed = clockedCache.cleanupExpired();

			expect(removed).toBe(2);
			expect(clockedCache.size).toBe(1);
			expect(clockedCache.get("key1")).toBe("value1");
		});

		test("should return zero when no entries have expired", () => {
			cache.set("key1", "value1", 1000);
			cache.set("key2", "value2", 1000);

			const removed = cache.cleanupExpired();

			expect(removed).toBe(0);
			expect(cache.size).toBe(2);
		});
	});

	describe("type safety", () => {
		test("should handle different value types when using generic type parameter", () => {
			const numberCache = new CacheService<number>();
			numberCache.set("age", 25, 1000);
			const numberResult = numberCache.get("age");

			expect(numberResult).toBe(25);

			const objectCache = new CacheService<{ name: string }>();
			objectCache.set("user", { name: "John" }, 1000);
			const objectResult = objectCache.get("user");

			expect(objectResult).toEqual({ name: "John" });
		});
	});
});
