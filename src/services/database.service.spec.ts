import { existsSync } from "fs";
import { unlink } from "fs/promises";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { ProcessedFileResult } from "@/types";

import { DatabaseService } from "./database.service";

/**
 * Test suite for Database Service
 * Tests database operations and data persistence
 */
describe("Database Service", () => {
	let dbService: DatabaseService;
	const TEST_DB_PATH = "test-snapshots.sqlite";

	beforeEach(async () => {
		// Clean up any existing test database
		if (existsSync(TEST_DB_PATH)) {
			await unlink(TEST_DB_PATH);
		}
		dbService = new DatabaseService(TEST_DB_PATH);
	});

	afterEach(async () => {
		// Clean up test database after each test
		if (existsSync(TEST_DB_PATH)) {
			await unlink(TEST_DB_PATH);
		}
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
		// Create a new instance with a fresh database
		const emptyDbService = new DatabaseService(`empty-${TEST_DB_PATH}`);
		const latestSnapshot = emptyDbService.getLatestSnapshot();
		expect(latestSnapshot).toBeNull();

		// Clean up the empty database
		if (existsSync(`empty-${TEST_DB_PATH}`)) {
			await unlink(`empty-${TEST_DB_PATH}`);
		}
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
		// Create multiple snapshots with different timestamps
		const timestamps = [
			1000000000000, // Older timestamp
			2000000000000, // Middle timestamp
			3000000000000, // Newer timestamp
		];

		// Create snapshots and store their IDs
		const snapshotIds = timestamps.map((timestamp) => dbService.createSnapshot(timestamp));

		// Retrieve all snapshots
		const snapshots = dbService.getSnapshots();

		// Verify snapshots were retrieved correctly
		expect(snapshots).toHaveLength(3);

		// Verify each snapshot has correct structure and data
		snapshots.forEach((snapshot, index) => {
			const expectedSnapshot = {
				id: snapshotIds[index] ?? 0,
				timestamp: timestamps[index] ?? 0,
				created_at: expect.any(String), // SQLite adds this automatically
			};

			expect(snapshot).toEqual(expectedSnapshot);
		});
	});
});
