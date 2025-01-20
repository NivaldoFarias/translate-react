import { existsSync, mkdirSync } from "fs";

import Bun from "bun";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult } from "../runner";
import type { TranslationFile } from "../types";
import type Logger from "../utils/logger";

export interface Snapshot {
	timestamp: number;
	repositoryTree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];
	filesToTranslate: TranslationFile[];
	processedResults: ProcessedFileResult[];
}

export class SnapshotManager {
	private readonly prefix = "snapshot";
	private readonly snapshotDir = ".snapshots";
	private readonly snapshotFilePath: string;
	private snapshot: Snapshot | null = null;

	private pendingWrites: Snapshot[] = [];
	private writeTimeout: number | null = null;
	private readonly WRITE_DELAY = 1000; // 1 second debounce

	constructor(private readonly logger?: Logger) {
		if (!existsSync(this.snapshotDir)) {
			mkdirSync(this.snapshotDir, { recursive: true });
		}

		this.snapshotFilePath = `${this.snapshotDir}/${this.prefix}-${Date.now()}.json`;

		process.on("SIGINT", async () => {
			await this.cleanup();
		});

		process.on("SIGTERM", async () => {
			await this.cleanup();
		});
	}

	private async flushWrites() {
		if (!this.pendingWrites.length) return;

		try {
			// Merge all pending writes into one snapshot
			const mergedData = this.pendingWrites.reduce((acc, curr) => ({ ...acc, ...curr }), {});
			const snapshot = { ...mergedData, timestamp: Date.now() } as Snapshot;

			this.snapshot = snapshot;
			await Bun.write(this.snapshotFilePath, JSON.stringify(this.snapshot, null, 2));

			this.logger?.info(`Snapshot saved to ${this.snapshotFilePath}`);
			this.pendingWrites = [];
		} catch (error) {
			this.logger?.error(
				`Failed to save snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	public async save(data: Snapshot) {
		this.pendingWrites.push(data);

		// Clear existing timeout if any
		if (this.writeTimeout) {
			clearTimeout(this.writeTimeout);
		}

		// Set new timeout to flush writes
		this.writeTimeout = setTimeout(() => {
			this.flushWrites();
			this.writeTimeout = null;
		}, this.WRITE_DELAY) as unknown as number;
	}

	public async append<K extends keyof Snapshot>(key: K, data: Snapshot[K]) {
		if (!this.snapshot) return;

		await this.save({ ...this.snapshot, [key]: data });
	}

	public async loadLatest() {
		try {
			const filesIterator = new Bun.Glob(`${this.prefix}-*.json`).scan({ cwd: this.snapshotDir });
			const files: string[] = [];

			for await (const file of filesIterator) {
				files.push(file);
			}

			if (files.length === 0) return null;

			// Get the most recent snapshot file based on the timestamp in filename
			const latestFile = files.toSorted().pop();
			if (!latestFile) return null;

			const checkpointPath = `${this.snapshotDir}/${latestFile}`;
			const file = Bun.file(checkpointPath);

			if (!(await file.exists())) return null;

			const snapshotData = await file.json();

			this.snapshot = snapshotData as Snapshot;

			return this.snapshot;
		} catch (error) {
			this.logger?.error(
				`Failed to load snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			return null;
		}
	}

	public async clear() {
		try {
			const filesIterator = new Bun.Glob(`${this.prefix}-*.json`).scan({ cwd: this.snapshotDir });
			const files: string[] = [];

			for await (const file of filesIterator) {
				files.push(file);
			}

			await Promise.all(files.map((file) => Bun.write(`${this.snapshotDir}/${file}`, "")));
			this.logger?.info("Cleared all snapshots");
		} catch (error) {
			this.logger?.error(
				`Failed to clear snapshots: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	private async cleanup() {
		this.logger?.info("Cleaning up snapshots...");

		if (this.writeTimeout) {
			clearTimeout(this.writeTimeout);
			this.writeTimeout = null;
		}

		// await this.flushWrites();
	}
}
