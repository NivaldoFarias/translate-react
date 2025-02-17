import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult, TranslationFile } from "../types";

import { DatabaseService } from "./database.service";

/**
 * # Snapshot Interface
 *
 * Represents a snapshot of the translation workflow state.
 */
export interface Snapshot {
	id: number;
	timestamp: number;
	repositoryTree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];
	filesToTranslate: TranslationFile[];
	processedResults: ProcessedFileResult[];
}

/**
 * # Snapshot Manager
 *
 * Manages the creation, saving, and loading of translation workflow snapshots.
 */
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

	public async save(data: Omit<Snapshot, "id">) {
		try {
			if (!this.currentSnapshotId) {
				this.currentSnapshotId = this.service.createSnapshot(data.timestamp);
			}

			this.service.saveRepositoryTree(this.currentSnapshotId, data.repositoryTree);
			this.service.saveFilesToTranslate(this.currentSnapshotId, data.filesToTranslate);
			this.service.saveProcessedResults(this.currentSnapshotId, data.processedResults);
		} catch (error) {
			console.error(
				`Failed to save snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

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
			console.error(
				`Failed to append ${key}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	public async loadLatest(): Promise<Snapshot | null> {
		try {
			const snapshot = this.service.getLatestSnapshot();

			if (snapshot) {
				this.currentSnapshotId = snapshot.id;
			}

			return snapshot;
		} catch (error) {
			console.error(
				`Failed to load snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			return null;
		}
	}

	public async clear() {
		try {
			this.service.clearSnapshots();
			this.currentSnapshotId = null;
		} catch (error) {
			console.error(
				`Failed to clear snapshots: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
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
			console.error(
				`Failed to cleanup snapshots: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}
