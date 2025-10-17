import { statSync } from "node:fs";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { Stats } from "node:fs";

import type { PatchedRepositoryItem, ProcessedFileResult } from "@/services/runner/";
import type { LanguageCacheRecord, SnapshotRecord } from "@/types";

import { Snapshot } from "../snapshot.service";
import { TranslationFile } from "../translator.service";

import { BaseDatabaseService } from "./base.service";

export interface LanguageCache {
	/**
	 * The detected language code
	 *
	 * @example "pt"
	 */
	detectedLanguage: string;

	/**
	 * Confidence score, on a scale from 0 to 1, of the language detection
	 *
	 * @example 0.99
	 */
	confidence: number;

	/** Timestamp of the language detection */
	timestamp: number;
}

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
	 *
	 * @returns Snapshot ID of the newly created snapshot
	 */
	public createSnapshot(timestamp: number = Date.now()): number {
		const statement = this.db.prepare(this.scripts.insert.snapshot);
		const result = statement.run(timestamp);

		return Number(result.lastInsertRowid);
	}

	/**
	 * Saves repository tree structure to database.
	 *
	 * Uses transactions for data integrity to ensure atomicity when inserting
	 * multiple tree entries.
	 *
	 * @param snapshotId ID of associated snapshot
	 * @param tree Repository tree structure from GitHub
	 */
	public saveRepositoryTree(
		snapshotId: number,
		tree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
	): void {
		const statement = this.db.prepare(this.scripts.insert.repositoryTree);

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
	 *
	 * Uses transactions for data integrity to ensure atomicity when inserting
	 * multiple translation files.
	 *
	 * @param snapshotId ID of associated snapshot
	 * @param files Files to be translated
	 */
	public saveFilesToTranslate(snapshotId: number, files: TranslationFile[]): void {
		const statement = this.db.prepare(this.scripts.insert.filesToTranslate);

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
	 * Includes branch info, PR details, and any errors. Uses transactions for
	 * data integrity to ensure atomicity when inserting multiple results.
	 *
	 * @param snapshotId ID of associated snapshot
	 * @param results Translation processing results
	 */
	public saveProcessedResults(snapshotId: number, results: ProcessedFileResult[]): void {
		const statement = this.db.prepare(this.scripts.insert.processedResults);

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
	 * Includes repository tree, files to translate, and processing results.
	 *
	 * @returns Snapshot object with all related data, or `null` if no snapshots exist
	 */
	public getLatestSnapshot(): Snapshot | null {
		const snapshot = this.db.prepare(this.scripts.select.latestSnapshot).get() as {
			id: number;
			timestamp: number;
		} | null;

		if (!snapshot) return null;

		const repositoryTree = this.db
			.prepare(this.scripts.select.repositoryTreeBySnapshotId)
			.all(snapshot.id) as PatchedRepositoryItem[];

		const filesToTranslate = this.db
			.prepare(this.scripts.select.filesToTranslateBySnapshotId)
			.all(snapshot.id) as TranslationFile[];

		const processedResults = this.db
			.prepare(this.scripts.select.processedResultsBySnapshotId)
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
	 *
	 * Uses transaction to ensure all-or-nothing deletion, maintaining referential
	 * integrity by deleting in the correct order (child tables first).
	 */
	public async clearSnapshots(): Promise<void> {
		this.db.transaction(() => {
			this.db.prepare(this.scripts.delete.allProcessedResults).run();
			this.db.prepare(this.scripts.delete.allFilesToTranslate).run();
			this.db.prepare(this.scripts.delete.allRepositoryTree).run();
			this.db.prepare(this.scripts.delete.allSnapshots).run();
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
	 *
	 * @param filename Name of the file to check
	 * @param contentHash Git SHA of the file content
	 *
	 * @returns Cached language data or `null` if not found or if SHA doesn't match
	 */
	public getLanguageCache(filename: string, contentHash: string): LanguageCache | null {
		const result = this.db.prepare(this.scripts.select.languageCache).get(filename, contentHash) as
			| LanguageCacheRecord
			| undefined;

		if (!result) return null;

		return {
			detectedLanguage: result.detected_language,
			confidence: result.confidence,
			timestamp: result.timestamp,
		};
	}

	/**
	 * Retrieves multiple cached language detection results for files in a single query.
	 *
	 * Checks both filename and content hash (SHA) for each file to ensure cache validity.
	 * Much more efficient than calling `getLanguageCache` N times.
	 *
	 * @param files Array of file entries with filename and content hash
	 *
	 * @returns Array of cached language data (only entries that exist in cache)
	 */
	public getLanguageCaches(
		files: Array<{ filename: string; contentHash: string }>,
	): Map<string, LanguageCache> {
		if (files.length === 0) return new Map();

		const placeholders = files.map(() => "(?, ?)").join(", ");
		const query = `
			SELECT filename, detected_language, confidence, timestamp 
			FROM language_cache 
			WHERE (filename, content_hash) IN (${placeholders})
		`;

		const params = files.flatMap((file) => [file.filename, file.contentHash]) as (
			| string
			| number
		)[];

		const results = this.db.prepare(query).all(...params) as Array<LanguageCacheRecord>;

		return new Map(
			results.map((row) => [
				row.filename,
				{
					detectedLanguage: row.detected_language,
					confidence: row.confidence,
					timestamp: row.timestamp,
				},
			]),
		);
	}

	/**
	 * Stores language detection result in cache.
	 *
	 * Uses REPLACE statement to update existing entries or insert new ones.
	 *
	 * @param params Language cache data to store
	 * @param params.filename Name of the file
	 * @param params.contentHash Git SHA of the file content
	 * @param params.detectedLanguage Detected language code (e.g., 'pt', 'en')
	 * @param params.confidence Detection confidence score (0-1)
	 */
	public setLanguageCache({
		filename,
		contentHash,
		detectedLanguage,
		confidence,
	}: {
		filename: string;
		contentHash: string;
		detectedLanguage: string;
		confidence: number;
	}): void {
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

	/**
	 * Removes old snapshots, keeping only the most recent ones.
	 *
	 * Executes deletion in a transaction and then runs VACUUM to reclaim disk space.
	 *
	 * @param keepCount Number of recent snapshots to retain (default: 10)
	 *
	 * @returns Number of snapshots deleted
	 */
	public cleanOldSnapshots(keepCount = 10): number {
		const result = this.db.transaction(() => {
			const beforeCount = this.db.prepare(this.scripts.select.countSnapshots).get() as {
				count: number;
			};

			this.db.prepare(this.scripts.delete.oldSnapshots).run(keepCount);

			const afterCount = this.db.prepare(this.scripts.select.countSnapshots).get() as {
				count: number;
			};

			return beforeCount.count - afterCount.count;
		})();

		this.db.run(this.scripts.other.vacuum);

		return result;
	}

	/**
	 * Generates comprehensive database statistics report.
	 *
	 * @returns Object containing table counts, recent snapshots, and recently processed files
	 */
	public getDatabaseStats() {
		return {
			snapshots: this.db.prepare(this.scripts.select.countSnapshots).get() as {
				count: number;
			},
			repositoryTree: this.db.prepare(this.scripts.select.countRepositoryTree).get() as {
				count: number;
			},
			filesToTranslate: this.db.prepare(this.scripts.select.countFilesToTranslate).get() as {
				count: number;
			},
			processedResults: this.db.prepare(this.scripts.select.countProcessedResults).get() as {
				count: number;
			},
			failedTranslations: this.db.prepare(this.scripts.select.countFailedTranslations).get() as {
				count: number;
			},
			languageCache: this.db.prepare(this.scripts.select.countLanguageCache).get() as {
				count: number;
			},
			recentSnapshots: this.db
				.prepare(this.scripts.select.recentSnapshots)
				.all() as SnapshotRecord[],
			recentProcessed: this.db.prepare(this.scripts.select.recentProcessedFiles).all() as Array<{
				filename: string;
				branch_ref: string | null;
				pull_request_number: number | null;
			}>,
		};
	}

	/**
	 * Validates database integrity.
	 *
	 * Attempts to query each table to verify they exist and are accessible.
	 *
	 * @returns Object indicating if database is valid and any error message if validation fails
	 */
	public validateDatabase(): { valid: boolean; error?: string } {
		try {
			this.db.prepare(this.scripts.select.countSnapshots).get();
			this.db.prepare(this.scripts.select.countRepositoryTree).get();
			this.db.prepare(this.scripts.select.countFilesToTranslate).get();
			this.db.prepare(this.scripts.select.countProcessedResults).get();
			this.db.prepare(this.scripts.select.countFailedTranslations).get();
			this.db.prepare(this.scripts.select.countLanguageCache).get();

			return { valid: true };
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : "Unknown validation error",
			};
		}
	}

	/**
	 * Gets the size of the database file in bytes.
	 *
	 * @param filename Database filename (default: "snapshots.sqlite")
	 *
	 * @returns File size in bytes or null if file doesn't exist
	 */
	public getDatabaseSize(filename = "snapshots.sqlite"): Stats | null {
		try {
			return statSync(filename);
		} catch {
			return null;
		}
	}
}
