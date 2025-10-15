/**
 * @fileoverview
 *
 * Tests for the {@link DatabaseService}.
 *
 * This suite covers database operations, data persistence, snapshot management,
 * and all CRUD operations for the translation workflow storage system.
 */

import { beforeEach, describe, expect, test } from "bun:test";

import type { ProcessedFileResult } from "@/services/runner/";

import { DatabaseService } from "@/services/database/";

describe("DatabaseService", () => {
	let dbService: DatabaseService;

	beforeEach(async () => {
		dbService = new DatabaseService(":memory:");
	});

	test("should create a new snapshot", () => {
		const timestamp = Date.now();
		const snapshotId = dbService.createSnapshot(timestamp);
		expect(snapshotId).toBeGreaterThan(0);
	});

	test("should save and retrieve repository tree", () => {
		const snapshotId = dbService.createSnapshot();
		const mockTree = [
			{
				path: "test/file.md",
				mode: "100644",
				type: "blob",
				sha: "abc123",
				size: 100,
				url: "https://api.github.com/repos/test/test/git/blobs/abc123",
			},
		];

		dbService.saveRepositoryTree(snapshotId, mockTree);
		const latestSnapshot = dbService.getLatestSnapshot();

		expect(latestSnapshot).not.toBeNull();
		expect(latestSnapshot?.repositoryTree).toHaveLength(1);
		expect(latestSnapshot?.repositoryTree[0]?.path).toBe("test/file.md");
	});

	test("should save and retrieve files to translate", () => {
		const snapshotId = dbService.createSnapshot();
		const mockFiles = [
			{
				path: "test/file.md",
				content: "# Test Content",
				sha: "abc123",
				filename: "file.md",
			},
		];

		dbService.saveFilesToTranslate(snapshotId, mockFiles);
		const latestSnapshot = dbService.getLatestSnapshot();

		expect(latestSnapshot).not.toBeNull();
		expect(latestSnapshot?.filesToTranslate).toHaveLength(1);
		expect(latestSnapshot?.filesToTranslate[0]?.content).toBe("# Test Content");
	});

	test("should save and retrieve processed results", () => {
		const snapshotId = dbService.createSnapshot();
		const mockResults = [
			{
				filename: "file.md",
				translation: "# Conteúdo de Teste",
				branch: {
					ref: "translate/file-md",
					node_id: "def456",
					url: "https://api.github.com/repos/test/test/git/refs/heads/translate/file-md",
					object: {
						sha: "def456",
						type: "commit",
						url: "https://api.github.com/repos/test/test/git/commits/def456",
					},
				},
				pullRequest: {
					number: 1,
					html_url: "https://github.com/test/test/pull/1",
					url: "https://api.github.com/repos/test/test/pulls/1",
					id: 1,
					node_id: "PR_1",
					diff_url: "https://api.github.com/repos/test/test/pulls/1.diff",
					patch_url: "https://api.github.com/repos/test/test/pulls/1.patch",
				},
			},
		] as ProcessedFileResult[];

		dbService.saveProcessedResults(snapshotId, mockResults);
		const latestSnapshot = dbService.getLatestSnapshot();

		expect(latestSnapshot).not.toBeNull();
		expect(latestSnapshot?.processedResults).toHaveLength(1);
		expect(latestSnapshot?.processedResults[0]?.filename).toBe("file.md");
	});

	test("should handle empty database state", async () => {
		const emptyDbService = new DatabaseService(":memory:");
		const latestSnapshot = emptyDbService.getLatestSnapshot();
		expect(latestSnapshot).toBeNull();
	});

	test("should clear snapshots", async () => {
		const snapshotId = dbService.createSnapshot();
		const mockResults = [
			{
				filename: "test.md",
				translation: "# Test",
				branch: {
					ref: "test-branch",
					node_id: "123",
					url: "test-url",
					object: {
						sha: "test-sha",
						type: "commit",
						url: "test-commit-url",
					},
				},
				pullRequest: {
					number: 1,
					html_url: "test-pr-url",
					url: "test-api-url",
					id: 1,
					node_id: "PR_1",
					diff_url: "test-diff-url",
					patch_url: "test-patch-url",
				},
			},
		] as ProcessedFileResult[];

		dbService.saveProcessedResults(snapshotId, mockResults);
		expect(dbService.getLatestSnapshot()).not.toBeNull();

		await dbService.clearSnapshots();
		expect(dbService.getLatestSnapshot()).toBeNull();
	});

	test("should handle database errors gracefully", () => {
		expect(() => new DatabaseService("/invalid/path/db.sqlite")).toThrow();
	});

	test("should retrieve all snapshots", () => {
		const timestamps = [1000000000000, 2000000000000, 3000000000000];

		const snapshotIds = timestamps.map((timestamp) => dbService.createSnapshot(timestamp));

		const snapshots = dbService.getSnapshots();

		expect(snapshots).toHaveLength(3);

		snapshots.forEach((snapshot, index) => {
			const expectedSnapshot = {
				id: snapshotIds[index] ?? 0,
				timestamp: timestamps[index] ?? 0,
				created_at: expect.any(String),
			};

			expect(snapshot).toEqual(expectedSnapshot);
		});
	});

	describe("Language Cache", () => {
		describe("getLanguageCache", () => {
			test("should return null for non-existent file", () => {
				const result = dbService.getLanguageCache("non-existent.md", "abc123");

				expect(result).toBeNull();
			});

			test("should return cached result when SHA matches", () => {
				dbService.setLanguageCache("test.md", "sha123", "pt", 0.95);

				const result = dbService.getLanguageCache("test.md", "sha123");

				expect(result).not.toBeNull();
				expect(result?.detectedLanguage).toBe("pt");
				expect(result?.confidence).toBe(0.95);
				expect(result?.timestamp).toBeGreaterThan(0);
			});

			test("should return null when SHA doesn't match (file changed)", () => {
				dbService.setLanguageCache("test.md", "old-sha", "pt", 0.95);

				const result = dbService.getLanguageCache("test.md", "new-sha");

				expect(result).toBeNull();
			});

			test("should handle multiple files independently", () => {
				dbService.setLanguageCache("file1.md", "sha1", "pt", 0.95);
				dbService.setLanguageCache("file2.md", "sha2", "en", 0.98);

				const result1 = dbService.getLanguageCache("file1.md", "sha1");
				const result2 = dbService.getLanguageCache("file2.md", "sha2");

				expect(result1?.detectedLanguage).toBe("pt");
				expect(result2?.detectedLanguage).toBe("en");
			});
		});

		describe("setLanguageCache", () => {
			test("should store language detection result", () => {
				dbService.setLanguageCache("test.md", "sha123", "pt", 0.95);

				const result = dbService.getLanguageCache("test.md", "sha123");

				expect(result).not.toBeNull();
				expect(result?.detectedLanguage).toBe("pt");
				expect(result?.confidence).toBe(0.95);
			});

			test("should update existing cache entry (REPLACE behavior)", () => {
				dbService.setLanguageCache("test.md", "sha123", "en", 0.85);
				dbService.setLanguageCache("test.md", "sha456", "pt", 0.95);

				const oldResult = dbService.getLanguageCache("test.md", "sha123");
				expect(oldResult).toBeNull();

				const newResult = dbService.getLanguageCache("test.md", "sha456");
				expect(newResult).not.toBeNull();
				expect(newResult?.detectedLanguage).toBe("pt");
				expect(newResult?.confidence).toBe(0.95);
			});

			test("should handle various confidence values", () => {
				const confidenceValues = [0.0, 0.5, 0.9, 0.99, 1.0];

				for (const confidence of confidenceValues) {
					const filename = `test-${confidence}.md`;
					dbService.setLanguageCache(filename, "sha123", "pt", confidence);

					const result = dbService.getLanguageCache(filename, "sha123");
					expect(result?.confidence).toBe(confidence);
				}
			});
		});

		describe("clearLanguageCache", () => {
			test("should remove all cache entries", () => {
				dbService.setLanguageCache("file1.md", "sha1", "pt", 0.95);
				dbService.setLanguageCache("file2.md", "sha2", "en", 0.98);
				dbService.setLanguageCache("file3.md", "sha3", "es", 0.92);

				dbService.clearLanguageCache();

				expect(dbService.getLanguageCache("file1.md", "sha1")).toBeNull();
				expect(dbService.getLanguageCache("file2.md", "sha2")).toBeNull();
				expect(dbService.getLanguageCache("file3.md", "sha3")).toBeNull();
			});

			test("should handle clearing empty cache", () => {
				expect(() => dbService.clearLanguageCache()).not.toThrow();
			});
		});

		describe("invalidateLanguageCache", () => {
			test("should remove specific files from cache", () => {
				dbService.setLanguageCache("file1.md", "sha1", "pt", 0.95);
				dbService.setLanguageCache("file2.md", "sha2", "en", 0.98);
				dbService.setLanguageCache("file3.md", "sha3", "es", 0.92);

				dbService.invalidateLanguageCache(["file1.md", "file3.md"]);

				expect(dbService.getLanguageCache("file1.md", "sha1")).toBeNull();
				expect(dbService.getLanguageCache("file3.md", "sha3")).toBeNull();

				const result = dbService.getLanguageCache("file2.md", "sha2");
				expect(result).not.toBeNull();
				expect(result?.detectedLanguage).toBe("en");
			});

			test("should handle invalidating non-existent files", () => {
				dbService.setLanguageCache("existing.md", "sha1", "pt", 0.95);

				expect(() => {
					dbService.invalidateLanguageCache(["existing.md", "non-existent.md"]);
				}).not.toThrow();

				expect(dbService.getLanguageCache("existing.md", "sha1")).toBeNull();
			});

			test("should handle empty array", () => {
				dbService.setLanguageCache("file.md", "sha1", "pt", 0.95);

				dbService.invalidateLanguageCache([]);

				expect(dbService.getLanguageCache("file.md", "sha1")).not.toBeNull();
			});

			test("should handle large arrays of filenames", () => {
				const filenames: string[] = [];
				for (let i = 0; i < 100; i++) {
					const filename = `file${i}.md`;
					filenames.push(filename);
					dbService.setLanguageCache(filename, `sha${i}`, "pt", 0.95);
				}

				dbService.invalidateLanguageCache(filenames);

				for (let i = 0; i < 100; i++) {
					expect(dbService.getLanguageCache(`file${i}.md`, `sha${i}`)).toBeNull();
				}
			});
		});

		describe("Integration scenarios", () => {
			test("should support typical workflow: check cache → analyze → update cache", () => {
				const filename = "homepage.md";
				const sha1 = "original-sha";
				const sha2 = "updated-sha";

				const firstCheck = dbService.getLanguageCache(filename, sha1);
				expect(firstCheck).toBeNull();

				dbService.setLanguageCache(filename, sha1, "pt", 0.95);

				const secondCheck = dbService.getLanguageCache(filename, sha1);
				expect(secondCheck).not.toBeNull();
				expect(secondCheck?.detectedLanguage).toBe("pt");

				const thirdCheck = dbService.getLanguageCache(filename, sha2);
				expect(thirdCheck).toBeNull();

				dbService.setLanguageCache(filename, sha2, "pt", 0.97);

				const fourthCheck = dbService.getLanguageCache(filename, sha2);
				expect(fourthCheck).not.toBeNull();
				expect(fourthCheck?.detectedLanguage).toBe("pt");
			});

			test("should support fork sync workflow: detect changes → invalidate cache", () => {
				const files = ["file1.md", "file2.md", "file3.md", "file4.md"];
				for (const file of files) {
					dbService.setLanguageCache(file, "old-sha", "pt", 0.95);
				}

				const changedFiles = ["file1.md", "file3.md"];
				dbService.invalidateLanguageCache(changedFiles);

				expect(dbService.getLanguageCache("file1.md", "old-sha")).toBeNull();
				expect(dbService.getLanguageCache("file3.md", "old-sha")).toBeNull();
				expect(dbService.getLanguageCache("file2.md", "old-sha")).not.toBeNull();
				expect(dbService.getLanguageCache("file4.md", "old-sha")).not.toBeNull();
			});
		});
	});
});
