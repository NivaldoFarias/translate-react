import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult } from "@/services/runner/";
import type { SnapshotRecord } from "@/types";

import { Snapshot } from "../snapshot.service";
import { TranslationFile } from "../translator.service";

import { BaseDatabaseService } from "./base.service";

/**
 * Core service for managing persistent storage of translation workflow data.
 *
 * Uses Bun's SQLite API for storing snapshots, repository tree, files, and results.
 *
 * ### Responsibilities
 *
 * - Manages persistent storage of translation workflow data
 * - Handles snapshots of repository state and files to translate
 * - Maintains translation history and results
 * - Provides data recovery and cleanup capabilities
 *
 * @see {@link https://bun.com/docs/api/sqlite|Bun's SQLite API Docs}
 */
export class DatabaseService extends BaseDatabaseService {
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
	 * Saves repository tree structure to database. Uses transactions for data integrity.
	 *
	 * @param snapshotId ID of associated snapshot
	 * @param tree Repository tree structure from GitHub
	 */
	public saveRepositoryTree(
		snapshotId: number,
		tree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
	): void {
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
	public saveFilesToTranslate(snapshotId: number, files: TranslationFile[]): void {
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
	 *
	 * - Includes branch info, PR details, and any errors.
	 * - Uses transactions for data integrity.
	 *
	 * @param snapshotId ID of associated snapshot
	 * @param results Translation processing results
	 */
	public saveProcessedResults(snapshotId: number, results: ProcessedFileResult[]): void {
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
	 * Fetches most recent workflow snapshot with all related data.
	 *
	 * Includes:
	 * - Repository tree
	 * - Files to translate
	 * - Processing results
	 *
	 * @returns `null` if no snapshots exist.
	 */
	public getLatestSnapshot(): Snapshot | null {
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
	public async clearSnapshots(): Promise<void> {
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
	public getSnapshots(): SnapshotRecord[] {
		return this.db.prepare(this.scripts.select.allSnapshots).all() as SnapshotRecord[];
	}

	/**
	 * Fetches a specific file to translate from database.
	 *
	 * @param filenames Filenames of files to fetch
	 *
	 * @returns Files to translate or null if not found
	 */
	public getFilesToTranslateByFilename(filenames: string[]): TranslationFile[] {
		return this.db
			.prepare(this.scripts.select.filesToTranslateByFilename)
			.all(filenames.join(",")) as TranslationFile[];
	}

	/**
	 * Deletes a specific workflow snapshot from database.
	 *
	 * @param id ID of snapshot to delete
	 */
	public deleteSnapshot(id: number): void {
		this.db.run(this.scripts.delete.snapshotById, [id]);
	}

	/**
	 * Retrieves cached language detection result for a file.
	 *
	 * Checks both filename and content hash (SHA) to ensure cache validity.
	 * Returns null if not found or if SHA doesn't match (file changed).
	 *
	 * @param filename Name of the file to check
	 * @param contentHash Git SHA of the file content
	 *
	 * @returns Cached language data or null if not found/invalid
	 */
	public getLanguageCache(
		filename: string,
		contentHash: string,
	): { detectedLanguage: string; confidence: number; timestamp: number } | null {
		const result = this.db.prepare(this.scripts.select.languageCache).get(filename, contentHash) as
			| { detected_language: string; confidence: number; timestamp: number }
			| undefined;

		if (!result) return null;

		return {
			detectedLanguage: result.detected_language,
			confidence: result.confidence,
			timestamp: result.timestamp,
		};
	}

	/**
	 * Stores language detection result in cache.
	 *
	 * Uses REPLACE to update existing entries or insert new ones.
	 *
	 * @param filename Name of the file
	 * @param contentHash Git SHA of the file content
	 * @param detectedLanguage Detected language code (e.g., 'pt', 'en')
	 * @param confidence Detection confidence score (0-1)
	 */
	public setLanguageCache(
		filename: string,
		contentHash: string,
		detectedLanguage: string,
		confidence: number,
	): void {
		this.db
			.prepare(this.scripts.insert.languageCache)
			.run(filename, contentHash, detectedLanguage, confidence, Date.now());
	}

	/**
	 * Removes all language cache entries.
	 *
	 * Useful for forcing fresh detection or debugging cache issues.
	 */
	public clearLanguageCache(): void {
		this.db.prepare(this.scripts.delete.allLanguageCache).run();
	}

	/**
	 * Removes language cache entries for specific files.
	 *
	 * Used when files are known to have changed (e.g., after fork sync).
	 *
	 * @param filenames Array of filenames to invalidate
	 */
	public invalidateLanguageCache(filenames: string[]): void {
		if (filenames.length === 0) return;

		const placeholders = filenames.map(() => "?").join(",");
		const query = `DELETE FROM language_cache WHERE filename IN (${placeholders})`;

		this.db.prepare(query).run(...filenames);
	}
}
