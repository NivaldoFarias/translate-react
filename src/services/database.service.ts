import { existsSync, writeFileSync } from "fs";

import { Database } from "bun:sqlite";

import type { ProcessedFileResult, TranslationFile } from "@/types";
import type { RestEndpointMethodTypes } from "@octokit/rest";

/**
 * # Database Service
 *
 * Core service for managing persistent storage of translation workflow data.
 * Uses SQLite for storing snapshots, repository tree, files, and results.
 *
 * ## Responsibilities
 * - Manages persistent storage of translation workflow data
 * - Handles snapshots of repository state and files to translate
 * - Maintains translation history and results
 * - Provides data recovery and cleanup capabilities
 */
export class DatabaseService {
	/** SQLite database connection instance */
	private readonly db: Database;

	/**
	 * Initializes database connection and creates required tables.
	 *
	 * @param dbPath Optional path to the database file. Defaults to 'snapshots.sqlite'
	 */
	constructor(dbPath = "snapshots.sqlite") {
		if (!existsSync(dbPath)) writeFileSync(dbPath, "");

		this.db = new Database(dbPath);
		this.initializeTables();
	}

	/**
	 * Creates required database tables if they don't exist:
	 * - snapshots: Workflow state snapshots
	 * - repository_tree: Git repository structure
	 * - files_to_translate: Files pending translation
	 * - processed_results: Translation results and status
	 * - failed_translations: Detailed error tracking for failed translations
	 */
	private initializeTables() {
		// Create snapshots table
		this.db.run(`
			CREATE TABLE IF NOT EXISTS snapshots (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				timestamp INTEGER NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`);

		// Create repository_tree table
		this.db.run(`
			CREATE TABLE IF NOT EXISTS repository_tree (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				snapshot_id INTEGER NOT NULL,
				path TEXT,
				mode TEXT,
				type TEXT,
				sha TEXT,
				size INTEGER,
				url TEXT,
				FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
			)
		`);

		// Create files_to_translate table
		this.db.run(`
			CREATE TABLE IF NOT EXISTS files_to_translate (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				snapshot_id INTEGER NOT NULL,
				content TEXT NOT NULL,
				sha TEXT NOT NULL,
				filename TEXT NOT NULL,
				path TEXT NOT NULL,
				FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
			)
		`);

		// Create processed_results table
		this.db.run(`
			CREATE TABLE IF NOT EXISTS processed_results (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				snapshot_id INTEGER NOT NULL,
				filename TEXT NOT NULL,
				branch_ref TEXT,
				branch_object_sha TEXT,
				translation TEXT,
				pull_request_number INTEGER,
				pull_request_url TEXT,
				error TEXT,
				FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
			)
		`);

		// Create failed_translations table for detailed error tracking
		this.db.run(`
			CREATE TABLE IF NOT EXISTS failed_translations (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				snapshot_id INTEGER NOT NULL,
				filename TEXT NOT NULL,
				error_message TEXT NOT NULL,
				timestamp INTEGER NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
			)
		`);
	}

	/**
	 * Creates a new workflow state snapshot.
	 *
	 * @param timestamp Optional timestamp for the snapshot
	 */
	public createSnapshot(timestamp: number = Date.now()): number {
		const statement = this.db.prepare("INSERT INTO snapshots (timestamp) VALUES (?)");
		const result = statement.run(timestamp);

		return Number(result.lastInsertRowid);
	}

	/**
	 * Saves repository tree structure to database.
	 * Uses transactions for data integrity.
	 *
	 * @param snapshotId ID of associated snapshot
	 * @param tree Repository tree structure from GitHub
	 */
	public saveRepositoryTree(
		snapshotId: number,
		tree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
	) {
		const statement = this.db.prepare(`
			INSERT INTO repository_tree (snapshot_id, path, mode, type, sha, size, url)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		const transaction = this.db.transaction(
			(items: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"]) => {
				for (const item of items) {
					const params = [
						snapshotId,
						item.path ?? null,
						item.mode ?? null,
						item.type ?? null,
						item.sha ?? null,
						item.size ?? null,
						item.url ?? null,
					] as const;

					statement.run(...params);
				}
			},
		);

		transaction(tree);
	}

	/**
	 * Saves files pending translation to database.
	 * Uses transactions for data integrity.
	 *
	 * @param snapshotId ID of associated snapshot
	 * @param files Files to be translated
	 */
	public saveFilesToTranslate(snapshotId: number, files: TranslationFile[]) {
		const statement = this.db.prepare(`
			INSERT INTO files_to_translate (snapshot_id, content, sha, filename, path)
			VALUES (?, ?, ?, ?, ?)
		`);

		const transaction = this.db.transaction((items: TranslationFile[]) => {
			for (const item of items) {
				const params = [snapshotId, item.content, item.sha, item.filename, item.path] as const;

				statement.run(...params);
			}
		});

		transaction(files);
	}

	/**
	 * Saves translation results to database.
	 * Includes branch info, PR details, and any errors.
	 * Uses transactions for data integrity.
	 *
	 * @param snapshotId ID of associated snapshot
	 * @param results Translation processing results
	 */
	public saveProcessedResults(snapshotId: number, results: ProcessedFileResult[]) {
		const statement = this.db.prepare(`
			INSERT INTO processed_results (
				snapshot_id, filename, branch_ref, branch_object_sha,
				translation, pull_request_number, pull_request_url, error
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);

		const transaction = this.db.transaction((items: ProcessedFileResult[]) => {
			for (const item of items) {
				const params = [
					snapshotId,
					item.filename,
					item.branch?.ref ?? null,
					item.branch?.object.sha ?? null,
					item.translation ?? null,
					item.pullRequest?.number ?? null,
					item.pullRequest?.html_url ?? null,
					item.error?.message ?? null,
				] as const;

				statement.run(...params);
			}
		});

		transaction(results);
	}

	/**
	 * Fetches most recent workflow snapshot with all related data:
	 * - Repository tree
	 * - Files to translate
	 * - Processing results
	 *
	 * Returns null if no snapshots exist.
	 */
	public getLatestSnapshot(): {
		id: number;
		timestamp: number;
		repositoryTree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];
		filesToTranslate: TranslationFile[];
		processedResults: ProcessedFileResult[];
	} | null {
		const snapshot = this.db
			.prepare("SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT 1")
			.get() as { id: number; timestamp: number } | null;

		if (!snapshot) return null;

		const repositoryTree = this.db
			.prepare("SELECT * FROM repository_tree WHERE snapshot_id = ?")
			.all(snapshot.id) as RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];

		const filesToTranslate = this.db
			.prepare("SELECT * FROM files_to_translate WHERE snapshot_id = ?")
			.all(snapshot.id) as TranslationFile[];

		const processedResults = this.db
			.prepare("SELECT * FROM processed_results WHERE snapshot_id = ?")
			.all(snapshot.id) as ProcessedFileResult[];

		return {
			id: snapshot.id,
			timestamp: snapshot.timestamp,
			repositoryTree,
			filesToTranslate,
			processedResults,
		};
	}

	/**
	 * Removes all data from database tables.
	 * Uses transaction to ensure all-or-nothing deletion.
	 */
	public async clearSnapshots() {
		this.db.transaction(() => {
			this.db.prepare("DELETE FROM processed_results").run();
			this.db.prepare("DELETE FROM files_to_translate").run();
			this.db.prepare("DELETE FROM repository_tree").run();
			this.db.prepare("DELETE FROM snapshots").run();
		})();
	}

	/**
	 * Fetches all workflow snapshots from database.
	 *
	 * @returns Array of snapshot objects
	 */
	public getSnapshots() {
		return this.db.prepare("SELECT * FROM snapshots").all() as { id: number; timestamp: number }[];
	}

	/**
	 * Deletes a specific workflow snapshot from database.
	 *
	 * @param id ID of snapshot to delete
	 */
	public deleteSnapshot(id: number) {
		this.db.run(`DELETE FROM snapshots WHERE id = ?`, [id]);
	}
}
