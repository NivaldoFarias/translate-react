import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult } from "../runner";
import type { TranslationFile } from "../types";
import type Logger from "../utils/logger";

import { SQLiteService } from "./sqlite";

export interface Snapshot {
	id: number;
	timestamp: number;
	repositoryTree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];
	filesToTranslate: TranslationFile[];
	processedResults: ProcessedFileResult[];
}

export class SnapshotManager {
	private readonly sqlite: SQLiteService;
	private currentSnapshotId: number | null = null;

	constructor(private readonly logger?: Logger) {
		this.sqlite = new SQLiteService();

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
				this.currentSnapshotId = this.sqlite.createSnapshot(data.timestamp);
			}

			this.sqlite.saveRepositoryTree(this.currentSnapshotId, data.repositoryTree);
			this.sqlite.saveFilesToTranslate(this.currentSnapshotId, data.filesToTranslate);
			this.sqlite.saveProcessedResults(this.currentSnapshotId, data.processedResults);

			this.logger?.info(`Snapshot saved with ID ${this.currentSnapshotId}`);
		} catch (error) {
			this.logger?.error(
				`Failed to save snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	public async append<K extends keyof Omit<Snapshot, "id">>(key: K, data: Snapshot[K]) {
		if (!this.currentSnapshotId) {
			this.currentSnapshotId = this.sqlite.createSnapshot();
		}

		try {
			switch (key) {
				case "repositoryTree":
					this.sqlite.saveRepositoryTree(
						this.currentSnapshotId,
						data as RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
					);
					break;
				case "filesToTranslate":
					this.sqlite.saveFilesToTranslate(this.currentSnapshotId, data as TranslationFile[]);
					break;
				case "processedResults":
					this.sqlite.saveProcessedResults(this.currentSnapshotId, data as ProcessedFileResult[]);
					break;
				default:
					throw new Error(`Invalid key: ${key}`);
			}

			this.logger?.info(`Appended ${key} to snapshot ${this.currentSnapshotId}`);
		} catch (error) {
			this.logger?.error(
				`Failed to append ${key}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	public async loadLatest(): Promise<Snapshot | null> {
		try {
			const snapshot = this.sqlite.getLatestSnapshot();

			if (snapshot) {
				this.currentSnapshotId = snapshot.id;
				this.logger?.info(`Loaded snapshot ${snapshot.id}`);
			}

			return snapshot;
		} catch (error) {
			this.logger?.error(
				`Failed to load snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			return null;
		}
	}

	public async clear() {
		try {
			this.sqlite.clearSnapshots();
			this.currentSnapshotId = null;
			this.logger?.info("Cleared all snapshots");
		} catch (error) {
			this.logger?.error(
				`Failed to clear snapshots: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	private async cleanup() {
		this.logger?.info("Cleaning up snapshots...");
	}
}
