import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult } from "../runner";
import type { TranslationFile } from "../types";

import { DatabaseService } from "./database";

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
export class SnapshotManager {
	private readonly dbService: DatabaseService;
	private currentSnapshotId: number | null = null;

	constructor() {
		this.dbService = new DatabaseService();

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
				this.currentSnapshotId = this.dbService.createSnapshot(data.timestamp);
			}

			this.dbService.saveRepositoryTree(this.currentSnapshotId, data.repositoryTree);
			this.dbService.saveFilesToTranslate(this.currentSnapshotId, data.filesToTranslate);
			this.dbService.saveProcessedResults(this.currentSnapshotId, data.processedResults);

			console.info(`Snapshot saved with ID ${this.currentSnapshotId}`);
		} catch (error) {
			console.error(
				`Failed to save snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	public async append<K extends keyof Omit<Snapshot, "id">>(key: K, data: Snapshot[K]) {
		if (!this.currentSnapshotId) {
			this.currentSnapshotId = this.dbService.createSnapshot();
		}

		try {
			switch (key) {
				case "repositoryTree":
					this.dbService.saveRepositoryTree(
						this.currentSnapshotId,
						data as RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
					);
					break;
				case "filesToTranslate":
					this.dbService.saveFilesToTranslate(this.currentSnapshotId, data as TranslationFile[]);
					break;
				case "processedResults":
					this.dbService.saveProcessedResults(
						this.currentSnapshotId,
						data as ProcessedFileResult[],
					);
					break;
				default:
					throw new Error(`Invalid key: ${key}`);
			}

			console.info(`Appended ${key} to snapshot ${this.currentSnapshotId}`);
		} catch (error) {
			console.error(
				`Failed to append ${key}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	public async loadLatest(): Promise<Snapshot | null> {
		try {
			const snapshot = this.dbService.getLatestSnapshot();

			if (snapshot) {
				this.currentSnapshotId = snapshot.id;
				console.info(`Loaded snapshot ${snapshot.id}`);
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
			this.dbService.clearSnapshots();
			this.currentSnapshotId = null;
			console.info("Cleared all snapshots");
		} catch (error) {
			console.error(
				`Failed to clear snapshots: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	private async cleanup() {
		console.info("Cleaning up snapshots...");
	}
}
