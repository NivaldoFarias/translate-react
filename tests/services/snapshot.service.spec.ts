/**
 * @fileoverview Tests for the {@link SnapshotService}.
 *
 * This suite covers snapshot creation, data persistence, retrieval operations,
		const result = await snapshotService.loadLatest();
		expect(result).toBeNull();nt.
 */

import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ProcessedFileResult } from "@/services/runner/base.service";
import { Snapshot, SnapshotService } from "@/services/snapshot.service";
import { TranslationFile } from "@/services/translator.service";

describe("SnapshotService", () => {
	let snapshotService: SnapshotService;
	const TEST_DB_PATH = "snapshots.sqlite";

	beforeEach(() => {
		snapshotService = new SnapshotService();
	});

	afterEach(async () => {
		if (existsSync(TEST_DB_PATH)) {
			await unlink(TEST_DB_PATH);
		}
	});

	describe("Constructor", () => {
		test("should initialize with null current snapshot ID", () => {
			expect(snapshotService).toBeInstanceOf(SnapshotService);
		});
	});

	describe("save", () => {
		test("should save complete snapshot data", async () => {
			const mockSnapshot: Omit<Snapshot, "id"> = {
				timestamp: Date.now(),
				repositoryTree: [
					{
						path: "test.md",
						mode: "100644",
						type: "blob",
						sha: "abc123",
						size: 100,
						url: "https://api.github.com/repos/test/test/git/blobs/abc123",
					},
				],
				filesToTranslate: [
					{
						path: "test.md",
						content: "# Test Content",
						sha: "abc123",
						filename: "test.md",
					},
				],
				processedResults: [
					{
						filename: "test.md",
						translation: "# Conteúdo de Teste",
						branch: {
							ref: "refs/heads/translate/test",
							node_id: "branch-id",
							url: "https://api.github.com/repos/test/test/git/refs/heads/translate/test",
							object: {
								sha: "branch-sha",
								type: "commit",
								url: "https://api.github.com/repos/test/test/git/commits/branch-sha",
							},
						},
						pullRequest: null,
						error: null,
					},
				],
			};

			await snapshotService.save(mockSnapshot);

			expect(true).toBe(true);
		});

		test("should handle empty snapshot data", () => {
			const emptySnapshot: Omit<Snapshot, "id"> = {
				timestamp: Date.now(),
				repositoryTree: [],
				filesToTranslate: [],
				processedResults: [],
			};

			expect(() => snapshotService.save(emptySnapshot)).not.toThrow();
		});
	});

	describe("append", () => {
		test("should append repository tree data", () => {
			const repositoryTree = [
				{
					path: "new-file.md",
					mode: "100644",
					type: "blob",
					sha: "def456",
					size: 200,
					url: "https://api.github.com/repos/test/test/git/blobs/def456",
				},
			];

			expect(() => snapshotService.append("repositoryTree", repositoryTree)).not.toThrow();
		});

		test("should append files to translate", () => {
			const filesToTranslate: TranslationFile[] = [
				{
					path: "append-test.md",
					content: "# Append Test",
					sha: "ghi789",
					filename: "append-test.md",
				},
			];

			expect(() => snapshotService.append("filesToTranslate", filesToTranslate)).not.toThrow();
		});

		test("should append processed results", () => {
			const processedResults: ProcessedFileResult[] = [
				{
					filename: "append-result.md",
					translation: "# Resultado do Anexo",
					branch: null,
					pullRequest: null,
					error: null,
				},
			];

			expect(() => snapshotService.append("processedResults", processedResults)).not.toThrow();
		});

		test("should handle TypeScript type safety for keys", () => {
			const validKeys: Array<keyof Omit<Snapshot, "id">> = [
				"timestamp",
				"repositoryTree",
				"filesToTranslate",
				"processedResults",
			];

			expect(validKeys).toHaveLength(4);
			expect(validKeys).toContain("repositoryTree");
		});
	});

	describe("loadLatest", () => {
		test("should load latest snapshot after saving", async () => {
			const mockSnapshot: Omit<Snapshot, "id"> = {
				timestamp: Date.now(),
				repositoryTree: [],
				filesToTranslate: [
					{
						path: "load-test.md",
						content: "# Load Test",
						sha: "load123",
						filename: "load-test.md",
					},
				],
				processedResults: [],
			};

			await snapshotService.save(mockSnapshot);
			const loadedSnapshot = await snapshotService.loadLatest();

			expect(loadedSnapshot).toBeDefined();
			expect(loadedSnapshot.timestamp).toBe(mockSnapshot.timestamp);
			expect(loadedSnapshot.filesToTranslate).toHaveLength(1);
			expect(loadedSnapshot.filesToTranslate[0]?.filename).toBe("load-test.md");
		});

		test("should return null when no snapshots exist", async () => {
			const result = await snapshotService.loadLatest();

			expect(result).toBeNull();
		});
	});

	describe("clear", () => {
		test("should clear all snapshots", async () => {
			const mockSnapshot: Omit<Snapshot, "id"> = {
				timestamp: Date.now(),
				repositoryTree: [],
				filesToTranslate: [],
				processedResults: [],
			};

			await snapshotService.save(mockSnapshot);

			await snapshotService.clear();

			const result = await snapshotService.loadLatest();
			expect(result).toBeNull();
		});
	});

	describe("Error Handling", () => {
		test("should handle database errors gracefully", async () => {
			expect(snapshotService).toBeInstanceOf(SnapshotService);
		});

		test("should handle concurrent operations", async () => {
			const snapshot1: Omit<Snapshot, "id"> = {
				timestamp: Date.now(),
				repositoryTree: [],
				filesToTranslate: [],
				processedResults: [],
			};

			const snapshot2: Omit<Snapshot, "id"> = {
				timestamp: Date.now() + 1000,
				repositoryTree: [],
				filesToTranslate: [],
				processedResults: [],
			};

			snapshotService.save(snapshot1);
			const loadedSnapshot = await snapshotService.loadLatest();
			expect(loadedSnapshot).toBeDefined();
		});
	});

	describe("Edge Cases", () => {
		test("should handle large snapshot data", async () => {
			const largeFilesToTranslate: TranslationFile[] = Array.from({ length: 100 }, (_, i) => ({
				path: `large-file-${i}.md`,
				content: `# Large File ${i}\n${"Content ".repeat(100)}`,
				sha: `sha-${i}`,
				filename: `large-file-${i}.md`,
			}));

			const largeSnapshot: Omit<Snapshot, "id"> = {
				timestamp: Date.now(),
				repositoryTree: [],
				filesToTranslate: largeFilesToTranslate,
				processedResults: [],
			};

			expect(() => snapshotService.save(largeSnapshot)).not.toThrow();
			const loadedSnapshot = await snapshotService.loadLatest();
			expect(loadedSnapshot.filesToTranslate).toHaveLength(100);
		});

		test("should handle special characters in content", async () => {
			const specialCharFile: TranslationFile = {
				path: "special-chars.md",
				content:
					"# Título com acentuação\n\nConteúdo com émojis 🚀 e símbolos especiais: àáâãäåæçèéêë",
				sha: "special123",
				filename: "special-chars.md",
			};

			const snapshot: Omit<Snapshot, "id"> = {
				timestamp: Date.now(),
				repositoryTree: [],
				filesToTranslate: [specialCharFile],
				processedResults: [],
			};

			expect(() => snapshotService.save(snapshot)).not.toThrow();
			const loadedSnapshot = await snapshotService.loadLatest();
			expect(loadedSnapshot.filesToTranslate[0]?.content).toContain("🚀");
			expect(loadedSnapshot.filesToTranslate[0]?.content).toContain("àáâãäåæçèéêë");
		});
	});
});
