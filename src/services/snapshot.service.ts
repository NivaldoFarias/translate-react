import type { ProcessedFileResult, TranslationFile } from "@/types";
import type { RestEndpointMethodTypes } from "@octokit/rest";

import { DatabaseService } from "@/services/database.service";
import { extractErrorMessage } from "@/utils/errors.util";

/** Represents a snapshot of the translation workflow state */
export interface Snapshot {
	id: number;
	timestamp: number;
	repositoryTree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];
	filesToTranslate: TranslationFile[];
	processedResults: ProcessedFileResult[];
}

/** Manages the creation, saving, and loading of translation workflow snapshots */
export class SnapshotService {
	private readonly service: DatabaseService;
	private currentSnapshotId: number | null = null;

	constructor() {
		this.service = new DatabaseService();

		process.on("SIGINT", async () => {
			await this.cleanup();
		});

		process.on("SIGTERM", async () => {
			await this.cleanup();
		});
	}

	/**
	 * Saves a snapshot of the translation workflow state
	 *
	 * @param data The data to save
	 *
	 * @example
	 * ```typescript
	 * const data = {
	 * 	timestamp: Date.now(),
	 * 	repositoryTree: [],
	 * 	filesToTranslate: [],
	 * 	processedResults: [],
	 * };
	 *
	 * await snapshotService.save(data);
	 * ```
	 */
	public async save(data: Omit<Snapshot, "id">) {
		try {
			if (!this.currentSnapshotId) {
				this.currentSnapshotId = this.service.createSnapshot(data.timestamp);
			}

			this.service.saveRepositoryTree(this.currentSnapshotId, data.repositoryTree);
			this.service.saveFilesToTranslate(this.currentSnapshotId, data.filesToTranslate);
			this.service.saveProcessedResults(this.currentSnapshotId, data.processedResults);
		} catch (error) {
			console.error(`Failed to save snapshot: ${extractErrorMessage(error)}`);
		}
	}

	/**
	 * Appends data to the current snapshot
	 *
	 * @param key The key of the data to append
	 * @param data The data to append
	 *
	 * @example
	 * ```typescript
	 * await snapshotService.append("repositoryTree", []);
	 * ```
	 */
	public async append<K extends keyof Omit<Snapshot, "id">>(key: K, data: Snapshot[K]) {
		if (!this.currentSnapshotId) {
			this.currentSnapshotId = this.service.createSnapshot();
		}

		try {
			switch (key) {
				case "repositoryTree":
					this.service.saveRepositoryTree(
						this.currentSnapshotId,
						data as RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
					);
					break;
				case "filesToTranslate":
					this.service.saveFilesToTranslate(this.currentSnapshotId, data as TranslationFile[]);
					break;
				case "processedResults":
					this.service.saveProcessedResults(this.currentSnapshotId, data as ProcessedFileResult[]);
					break;
				default:
					throw new Error(`Invalid key: ${key}`);
			}
		} catch (error) {
			console.error(`Failed to append ${key}: ${extractErrorMessage(error)}`);
		}
	}

	/**
	 * Loads the latest snapshot
	 *
	 * @example
	 * ```typescript
	 * const snapshot = await snapshotService.loadLatest();
	 * ```
	 */
	public async loadLatest() {
		try {
			const snapshot = this.service.getLatestSnapshot();
			if (snapshot) this.currentSnapshotId = snapshot.id;

			return snapshot as Snapshot;
		} catch (error) {
			throw new Error(`Failed to load snapshot: ${extractErrorMessage(error)}`);
		}
	}

	/**
	 * Clears all snapshots from the database
	 *
	 * @example
	 * ```typescript
	 * await snapshotService.clear();
	 * ```
	 */
	public async clear() {
		try {
			this.service.clearSnapshots();
			this.currentSnapshotId = null;
		} catch (error) {
			console.error(`Failed to clear snapshots: ${extractErrorMessage(error)}`);
		}
	}

	/**
	 * Cleans up old snapshots from the database to prevent excessive storage usage.
	 * Keeps only the most recent snapshot and removes all others.
	 *
	 * @example
	 * ```typescript
	 * await snapshotService.cleanup();
	 * ```
	 */
	private async cleanup() {
		try {
			const latestSnapshot = await this.loadLatest();
			if (!latestSnapshot) return;

			const snapshots = this.service.getSnapshots();

			for (const snapshot of snapshots) {
				if (snapshot.id === latestSnapshot.id) continue;

				this.service.deleteSnapshot(snapshot.id);
			}
		} catch (error) {
			console.error(`Failed to cleanup snapshots: ${extractErrorMessage(error)}`);
		}
	}
}
