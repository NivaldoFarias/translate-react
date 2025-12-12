import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { CacheService } from "@/services/cache/cache.service";

describe("CacheService", () => {
	let cache: CacheService<string>;

	beforeEach(() => {
		cache = new CacheService<string>();
	});

	afterEach(() => {
		cache.clear();
	});

	describe("set and get", () => {
		test("should store and retrieve a value when key is valid", () => {
			cache.set("key1", "value1", 1000);

			const result = cache.get("key1");

			expect(result).toBe("value1");
		});

		test("should return null when key does not exist", () => {
			const result = cache.get("nonexistent");

			expect(result).toBeNull();
		});

		test("should return null when value has expired beyond TTL", async () => {
			cache.set("key1", "value1", 50);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const result = cache.get("key1");

			expect(result).toBeNull();
		});

		test("should automatically remove expired entry when accessed", async () => {
			cache.set("key1", "value1", 50);
			expect(cache.size).toBe(1);

			await new Promise((resolve) => setTimeout(resolve, 100));
			cache.get("key1");

			expect(cache.size).toBe(0);
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

		test("should exclude expired entries when retrieving multiple values", async () => {
			cache.set("key1", "value1", 1000);
			cache.set("key2", "value2", 50);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const results = cache.getMany(["key1", "key2"]);

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

		test("should return false when key has expired beyond TTL", async () => {
			cache.set("key1", "value1", 50);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const result = cache.has("key1");

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
		test("should remove all expired entries when some entries have exceeded TTL", async () => {
			cache.set("key1", "value1", 1000);
			cache.set("key2", "value2", 50);
			cache.set("key3", "value3", 50);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const removed = cache.cleanupExpired();

			expect(removed).toBe(2);
			expect(cache.size).toBe(1);
			expect(cache.get("key1")).toBe("value1");
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
