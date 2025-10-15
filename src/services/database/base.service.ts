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

	/** The SQL scripts for creating database tables */
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
			filesToTranslateByFilename: `
          SELECT * FROM files_to_translate WHERE filename IN (?)
        `,
			/** Selects all snapshots */
			allSnapshots: `
          SELECT * FROM snapshots
        `,
			/** Selects the latest snapshot */
			languageCache: `
          SELECT detected_language, confidence, timestamp 
          FROM language_cache 
          WHERE filename = ? AND content_hash = ?
        `,
		},
		insert: {
			languageCache: `
          REPLACE INTO language_cache (filename, content_hash, detected_language, confidence, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `,
		},
		dropTable: {
			snapshots: "DROP TABLE IF EXISTS snapshots",
			repositoryTree: "DROP TABLE IF EXISTS repository_tree",
			filesToTranslate: "DROP TABLE IF EXISTS files_to_translate",
			processedResults: "DROP TABLE IF EXISTS processed_results",
			failedTranslations: "DROP TABLE IF EXISTS failed_translations",
			languageCache: "DROP TABLE IF EXISTS language_cache",
		},
		delete: {
			snapshotById: "DELETE FROM snapshots WHERE id = ?",
			repositoryTreeById: "DELETE FROM repository_tree WHERE id = ?",
			filesToTranslateById: "DELETE FROM files_to_translate WHERE id = ?",
			processedResultsById: "DELETE FROM processed_results WHERE id = ?",
			failedTranslationsById: "DELETE FROM failed_translations WHERE id = ?",
			allLanguageCache: "DELETE FROM language_cache",
		},
	};
}
