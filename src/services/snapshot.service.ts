import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { PatchedRepositoryItem, PullRequestStatus } from "@/services/runner/";

import { extractErrorMessage } from "@/errors/";
import { DatabaseService } from "@/services/database/";
import { ProcessedFileResult } from "@/services/runner/";
import { setupSignalHandlers } from "@/utils/";

import { TranslationFile } from "./translator.service";

/** Represents a snapshot of the translation workflow state */
export interface Snapshot {
	/** The ID of the snapshot */
	id: number;

	/** The timestamp of the snapshot */
	timestamp: number;

	/** The repository tree */
	repositoryTree: PatchedRepositoryItem[];

	/** The files to translate */
	filesToTranslate: TranslationFile[];

	/** The processed results */
	processedResults: ProcessedFileResult[];

	/**
	 * Map of file paths to invalid PR information.
	 *
	 * Tracks files that have existing PRs with conflicts or unmergeable status.
	 * Used to add informational notes when creating new PRs for these files.
	 *
	 * @default new Map()
	 */
	invalidPRsByFile?: Map<string, { prNumber: number; status: PullRequestStatus }>;
}

/** Manages the creation, saving, and loading of translation workflow snapshots */
export class SnapshotService {
	private readonly service = new DatabaseService();
	private currentSnapshotId: number | null = null;

	constructor() {
		setupSignalHandlers(async () => await this.cleanup());
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
	public async save(data: Omit<Snapshot, "id">): Promise<void> {
		if (!this.currentSnapshotId) {
			this.currentSnapshotId = this.service.createSnapshot(data.timestamp);
		}

		this.service.saveRepositoryTree(this.currentSnapshotId, data.repositoryTree);
		this.service.saveFilesToTranslate(this.currentSnapshotId, data.filesToTranslate);
		this.service.saveProcessedResults(this.currentSnapshotId, data.processedResults);
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
	public async append<K extends keyof Omit<Snapshot, "id">>(
		key: K,
		data: Snapshot[K],
	): Promise<void> {
		if (!this.currentSnapshotId) {
			this.currentSnapshotId = this.service.createSnapshot();
		}

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
	}

	/**
	 * Loads the latest snapshot
	 *
	 * @example
	 * ```typescript
	 * const snapshot = await snapshotService.loadLatest();
	 * ```
	 */
	public async loadLatest(): Promise<Snapshot> {
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
	public async clear(): Promise<void> {
		this.service.clearSnapshots();
		this.currentSnapshotId = null;
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
	private async cleanup(): Promise<void> {
		const latestSnapshot = await this.loadLatest();
		if (!latestSnapshot) return;

		const snapshots = this.service.getSnapshots();

		for (const snapshot of snapshots) {
			if (snapshot.id === latestSnapshot.id) continue;

			this.service.deleteSnapshot(snapshot.id);
		}
	}
}
