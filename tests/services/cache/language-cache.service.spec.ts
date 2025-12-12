import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { LanguageCacheService } from "@/services/cache/language-cache.service";

describe("LanguageCacheService", () => {
	let cache: LanguageCacheService;

	beforeEach(() => {
		cache = new LanguageCacheService();
	});

	afterEach(() => {
		cache.clear();
	});

	describe("set and get", () => {
		test("should store and retrieve language detection result when valid parameters provided", () => {
			const entry = {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			};

			cache.set("docs/hello.md", "abc123", entry);
			const result = cache.get("docs/hello.md", "abc123");

			expect(result).toEqual(entry);
		});

		test("should return null when file does not exist in cache", () => {
			const result = cache.get("docs/nonexistent.md", "xyz789");

			expect(result).toBeNull();
		});

		test("should return null when content hash differs from cached entry", () => {
			const entry = {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			};

			cache.set("docs/hello.md", "abc123", entry);
			const result = cache.get("docs/hello.md", "different-hash");

			expect(result).toBeNull();
		});

		test("should isolate cache entries using composite key when same filename has different hashes", () => {
			const entry1 = {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			};
			const entry2 = {
				detectedLanguage: "en",
				confidence: 0.95,
				timestamp: Date.now(),
			};

			cache.set("docs/hello.md", "hash1", entry1);
			cache.set("docs/hello.md", "hash2", entry2);

			expect(cache.get("docs/hello.md", "hash1")).toEqual(entry1);
			expect(cache.get("docs/hello.md", "hash2")).toEqual(entry2);
		});
	});

	describe("getMany", () => {
		test("should retrieve multiple language cache entries efficiently when all entries exist", () => {
			const entry1 = {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			};
			const entry2 = {
				detectedLanguage: "en",
				confidence: 0.95,
				timestamp: Date.now(),
			};
			const entry3 = {
				detectedLanguage: "pt",
				confidence: 0.97,
				timestamp: Date.now(),
			};

			cache.set("docs/file1.md", "hash1", entry1);
			cache.set("docs/file2.md", "hash2", entry2);
			cache.set("docs/file3.md", "hash3", entry3);
			const results = cache.getMany([
				{ filename: "docs/file1.md", contentHash: "hash1" },
				{ filename: "docs/file2.md", contentHash: "hash2" },
				{ filename: "docs/file3.md", contentHash: "hash3" },
			]);

			expect(results.size).toBe(3);
			expect(results.get("docs/file1.md")).toEqual(entry1);
			expect(results.get("docs/file2.md")).toEqual(entry2);
			expect(results.get("docs/file3.md")).toEqual(entry3);
		});

		test("should only return cache hits when some requested entries do not exist", () => {
			const entry1 = {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			};

			cache.set("docs/file1.md", "hash1", entry1);
			const results = cache.getMany([
				{ filename: "docs/file1.md", contentHash: "hash1" },
				{ filename: "docs/file2.md", contentHash: "hash2" },
				{ filename: "docs/file3.md", contentHash: "hash3" },
			]);

			expect(results.size).toBe(1);
			expect(results.get("docs/file1.md")).toEqual(entry1);
			expect(results.has("docs/file2.md")).toBe(false);
			expect(results.has("docs/file3.md")).toBe(false);
		});

		test("should return empty map when files array is empty", () => {
			const results = cache.getMany([]);

			expect(results.size).toBe(0);
		});

		test("should exclude entries when content hash does not match cached entry", () => {
			const entry = {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			};

			cache.set("docs/file1.md", "hash1", entry);
			const results = cache.getMany([{ filename: "docs/file1.md", contentHash: "wrong-hash" }]);

			expect(results.size).toBe(0);
		});
	});

	describe("clear", () => {
		test("should remove all language cache entries when cache contains multiple items", () => {
			cache.set("docs/file1.md", "hash1", {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			});
			cache.set("docs/file2.md", "hash2", {
				detectedLanguage: "en",
				confidence: 0.95,
				timestamp: Date.now(),
			});

			cache.clear();

			expect(cache.size).toBe(0);
			expect(cache.get("docs/file1.md", "hash1")).toBeNull();
			expect(cache.get("docs/file2.md", "hash2")).toBeNull();
		});
	});

	describe("size", () => {
		test("should return correct number of cached entries when adding items progressively", () => {
			expect(cache.size).toBe(0);

			cache.set("docs/file1.md", "hash1", {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			});

			expect(cache.size).toBe(1);

			cache.set("docs/file2.md", "hash2", {
				detectedLanguage: "en",
				confidence: 0.95,
				timestamp: Date.now(),
			});

			expect(cache.size).toBe(2);
		});
	});

	describe("TTL behavior", () => {
		test("should set entries to expire after one hour by default when no custom TTL provided", () => {
			const entry = {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			};

			cache.set("docs/file1.md", "hash1", entry);
			const result = cache.get("docs/file1.md", "hash1");

			expect(result).toEqual(entry);
			expect(cache.size).toBe(1);
		});
	});

	describe("real-world usage patterns", () => {
		test("should efficiently cache and retrieve language detection results in translation workflow", () => {
			const files = [
				{ path: "docs/hello.md", sha: "abc123", detectedLanguage: "pt", confidence: 0.99 },
				{ path: "docs/intro.md", sha: "def456", detectedLanguage: "en", confidence: 0.95 },
				{ path: "docs/guide.md", sha: "ghi789", detectedLanguage: "pt", confidence: 0.97 },
			];

			for (const file of files) {
				cache.set(file.path, file.sha, {
					detectedLanguage: file.detectedLanguage,
					confidence: file.confidence,
					timestamp: Date.now(),
				});
			}
			const cachedResults = cache.getMany(
				files.map((f) => ({ filename: f.path, contentHash: f.sha })),
			);

			expect(cachedResults.size).toBe(3);

			for (const file of files) {
				const cached = cachedResults.get(file.path);
				expect(cached?.detectedLanguage).toBe(file.detectedLanguage);
			}
		});

		test("should maintain separate cache entries when file content changes", () => {
			cache.set("docs/hello.md", "old-hash", {
				detectedLanguage: "en",
				confidence: 0.95,
				timestamp: Date.now(),
			});
			cache.set("docs/hello.md", "new-hash", {
				detectedLanguage: "pt",
				confidence: 0.99,
				timestamp: Date.now(),
			});

			const oldHashResult = cache.get("docs/hello.md", "old-hash");
			expect(oldHashResult?.detectedLanguage).toBe("en");

			const newHashResult = cache.get("docs/hello.md", "new-hash");
			expect(newHashResult?.detectedLanguage).toBe("pt");
		});
	});
});
