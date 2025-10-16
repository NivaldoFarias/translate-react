import { Database } from "bun:sqlite";

import type { DatabaseOptions } from "bun:sqlite";

/**
 * Base service for managing persistent storage of translation workflow data.
 *
 * @see {@link https://bun.com/docs/api/sqlite|Bun's SQLite API Docs}
 */
export class BaseDatabaseService {
	/** SQLite database connection instance */
	protected readonly db: Database;

	/**
	 * Initializes database connection and creates required tables.
	 * Parameters reflects Bun's Database constructor.
	 *
	 * @param filename The filename of the database to open.
	 * Pass an empty string (`""`) or `":memory:"` or `undefined` for an in-memory database.
	 * @param options defaults to `{readwrite: true, create: true}`.
	 * If a number, then it's treated as `SQLITE_OPEN_*` constant flags.
	 */
	constructor(filename = "snapshots.sqlite", options?: number | DatabaseOptions) {
		this.db = new Database(filename, options);
		this.initializeTables();
	}

	/**
	 * Initializes database tables.
	 *
	 * Creates required database tables if they don't exist:
	 * - snapshots: Workflow state snapshots
	 * - repository_tree: Git repository structure
	 * - files_to_translate: Files pending translation
	 * - processed_results: Translation results and status
	 * - failed_translations: Detailed error tracking for failed translations
	 */
	private initializeTables(): void {
		for (const script of Object.values(this.scripts.createTable)) {
			const sanitizedScript = script.replace(/\s+/g, " ");

			this.db.run(sanitizedScript);
		}
	}

	/** The SQL scripts for database operations */
	protected readonly scripts = {
		createTable: {
			/** Creates the snapshots table */
			snapshots: `
          CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `,
			/** Creates the repository_tree table */
			repositoryTree: `
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
        `,
			/** Creates the files_to_translate table */
			filesToTranslate: `
          CREATE TABLE IF NOT EXISTS files_to_translate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            sha TEXT NOT NULL,
            filename TEXT NOT NULL,
            path TEXT NOT NULL,
            FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
          )
        `,
			/** Creates the processed_results table */
			processedResults: `
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
        `,
			/** Creates the failed_translations table */
			failedTranslations: `
          CREATE TABLE IF NOT EXISTS failed_translations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            error_message TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
          )
        `,
			/** Creates the language_cache table */
			languageCache: `
          CREATE TABLE IF NOT EXISTS language_cache (
            filename TEXT PRIMARY KEY,
            content_hash TEXT NOT NULL,
            detected_language TEXT NOT NULL,
            confidence REAL NOT NULL,
            timestamp INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_content_hash ON language_cache(content_hash);
          CREATE INDEX IF NOT EXISTS idx_filename ON language_cache(filename);
        `,
		},
		select: {
			/** Selects files to translate by their filenames */
			filesToTranslateByFilename: `SELECT * FROM files_to_translate WHERE filename IN (?)`,
			/** Selects all snapshots */
			allSnapshots: `SELECT * FROM snapshots`,
			/** Selects the latest snapshot */
			latestSnapshot: `SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT 1`,
			/** Selects repository tree by snapshot ID */
			repositoryTreeBySnapshotId: `SELECT * FROM repository_tree WHERE snapshot_id = ?`,
			/** Selects files to translate by snapshot ID */
			filesToTranslateBySnapshotId: `SELECT * FROM files_to_translate WHERE snapshot_id = ?`,
			/** Selects processed results by snapshot ID */
			processedResultsBySnapshotId: `SELECT * FROM processed_results WHERE snapshot_id = ?`,
			/** Counts all snapshots */
			countSnapshots: `SELECT COUNT(*) as count FROM snapshots`,
			/** Counts all repository tree entries */
			countRepositoryTree: `SELECT COUNT(*) as count FROM repository_tree`,
			/** Counts all files to translate */
			countFilesToTranslate: `SELECT COUNT(*) as count FROM files_to_translate`,
			/** Counts all processed results */
			countProcessedResults: `SELECT COUNT(*) as count FROM processed_results`,
			/** Counts all failed translations */
			countFailedTranslations: `SELECT COUNT(*) as count FROM failed_translations`,
			/** Counts all language cache entries */
			countLanguageCache: `SELECT COUNT(*) as count FROM language_cache`,
			/** Selects recent snapshots with limit */
			recentSnapshots: `SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT 5`,
			/** Selects recent processed files with details */
			recentProcessedFiles: `
          SELECT filename, branch_ref, pull_request_number 
          FROM processed_results 
          ORDER BY id DESC 
          LIMIT 10
					`,
			/** Selects language cache by filename and content hash */
			languageCache: `
							SELECT detected_language, confidence, timestamp 
							FROM language_cache 
							WHERE filename = ? AND content_hash = ?
						`,
		},
		insert: {
			/** Inserts a new snapshot */
			snapshot: `
          INSERT INTO snapshots (timestamp) VALUES (?)
        `,
			/** Inserts repository tree entries */
			repositoryTree: `
          INSERT INTO repository_tree (snapshot_id, path, mode, type, sha, size, url)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
			/** Inserts files to translate */
			filesToTranslate: `
          INSERT INTO files_to_translate (snapshot_id, content, sha, filename, path)
          VALUES (?, ?, ?, ?, ?)
        `,
			/** Inserts processed results */
			processedResults: `
          INSERT INTO processed_results (
            snapshot_id, filename, branch_ref, branch_object_sha,
            translation, pull_request_number, pull_request_url, error
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
			/** Inserts or replaces language cache entry */
			languageCache: `
          REPLACE INTO language_cache (filename, content_hash, detected_language, confidence, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `,
		},
		dropTable: {
			/** Drops the snapshots table */
			snapshots: "DROP TABLE IF EXISTS snapshots",
			/** Drops the repository tree table */
			repositoryTree: "DROP TABLE IF EXISTS repository_tree",
			/** Drops the files to translate table */
			filesToTranslate: "DROP TABLE IF EXISTS files_to_translate",
			/** Drops the processed results table */
			processedResults: "DROP TABLE IF EXISTS processed_results",
			/** Drops the failed translations table */
			failedTranslations: "DROP TABLE IF EXISTS failed_translations",
			/** Drops the language cache table */
			languageCache: "DROP TABLE IF EXISTS language_cache",
		},
		delete: {
			/** Deletes snapshot by ID */
			snapshotById: "DELETE FROM snapshots WHERE id = ?",
			/** Deletes repository tree entry by ID */
			repositoryTreeById: "DELETE FROM repository_tree WHERE id = ?",
			/** Deletes file to translate by ID */
			filesToTranslateById: "DELETE FROM files_to_translate WHERE id = ?",
			/** Deletes processed result by ID */
			processedResultsById: "DELETE FROM processed_results WHERE id = ?",
			/** Deletes failed translation by ID */
			failedTranslationsById: "DELETE FROM failed_translations WHERE id = ?",
			/** Deletes all processed results */
			allProcessedResults: "DELETE FROM processed_results",
			/** Deletes all files to translate */
			allFilesToTranslate: "DELETE FROM files_to_translate",
			/** Deletes all repository tree entries */
			allRepositoryTree: "DELETE FROM repository_tree",
			/** Deletes all snapshots */
			allSnapshots: "DELETE FROM snapshots",
			/** Deletes all language cache entries */
			allLanguageCache: "DELETE FROM language_cache",
			/** Deletes old snapshots, keeping the most recent ones */
			oldSnapshots: `
          DELETE FROM snapshots 
          WHERE id NOT IN (
            SELECT id FROM snapshots 
            ORDER BY timestamp DESC 
            LIMIT ?
          )
        `,
		},
		other: {
			/** VACUUM command to reclaim unused space */
			vacuum: "VACUUM",
		},
	} as const;
}
