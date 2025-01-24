import { Database } from "bun:sqlite";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult } from "../runner";
import type { TranslationFile } from "../types";

export class SQLiteService {
	private db: Database;

	constructor() {
		this.db = new Database("snapshots.sqlite");
		this.initializeTables();
	}

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
				path TEXT NOT NULL,
				content TEXT NOT NULL,
				sha TEXT NOT NULL,
				filename TEXT,
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
	}

	public createSnapshot(timestamp: number = Date.now()): number {
		const stmt = this.db.prepare("INSERT INTO snapshots (timestamp) VALUES (?)");
		const result = stmt.run(timestamp);

		return Number(result.lastInsertRowid);
	}

	public saveRepositoryTree(
		snapshotId: number,
		tree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
	) {
		const stmt = this.db.prepare(`
			INSERT INTO repository_tree (snapshot_id, path, mode, type, sha, size, url)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		const transaction = this.db.transaction((items) => {
			for (const item of items) {
				stmt.run(snapshotId, item.path, item.mode, item.type, item.sha, item.size, item.url);
			}
		});

		transaction(tree);
	}

	public saveFilesToTranslate(snapshotId: number, files: TranslationFile[]) {
		const stmt = this.db.prepare(`
			INSERT INTO files_to_translate (snapshot_id, path, content, sha, filename)
			VALUES (?, ?, ?, ?, ?)
		`);

		const transaction = this.db.transaction((items) => {
			for (const item of items) {
				stmt.run(snapshotId, item.path, item.content, item.sha, item.filename);
			}
		});

		transaction(files);
	}

	public saveProcessedResults(snapshotId: number, results: ProcessedFileResult[]) {
		const stmt = this.db.prepare(`
			INSERT INTO processed_results (
				snapshot_id, filename, branch_ref, branch_object_sha,
				translation, pull_request_number, pull_request_url, error
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);

		const transaction = this.db.transaction((items) => {
			for (const item of items) {
				stmt.run(
					snapshotId,
					item.filename,
					item.branch?.ref,
					item.branch?.object.sha,
					typeof item.translation === "string" ?
						item.translation
					:	item.translation?.choices[0].message.content,
					item.pullRequest?.number,
					item.pullRequest?.html_url,
					item.error?.message,
				);
			}
		});

		transaction(results);
	}

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

	public clearSnapshots() {
		const tables = ["processed_results", "files_to_translate", "repository_tree", "snapshots"];

		const transaction = this.db.transaction(() => {
			for (const table of tables) {
				this.db.run(`DELETE FROM ${table}`);
			}
		});

		transaction();
	}
}
