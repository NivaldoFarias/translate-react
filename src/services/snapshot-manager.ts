import { existsSync, mkdirSync, readdirSync } from "node:fs";

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
	private readonly snapshotDir = ".snapshots";
	private readonly currentTimestamp: string;
	private readonly currentDir: string;
	private snapshot: Snapshot | null = null;
	private static readonly DEFAULT_SNAPSHOT_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

	private pendingWrites: Map<string, any> = new Map();
	private writeTimeout: number | null = null;
	private readonly WRITE_DELAY = 1000; // 1 second debounce

	constructor(
		private readonly logger?: Logger,
		private readonly snapshotTTL: number = SnapshotManager.DEFAULT_SNAPSHOT_TTL,
	) {
		this.currentTimestamp = Date.now().toString();
		this.currentDir = `${this.snapshotDir}/${this.currentTimestamp}`;

		process.on("SIGINT", async () => {
			await this.cleanup();
		});

		process.on("SIGTERM", async () => {
			await this.cleanup();
		});
	}

	private getFilePath(key: string) {
		return `${this.currentDir}/${key}.json`;
	}

	private async flushWrites() {
		if (!this.pendingWrites.size) return;

		try {
			const writePromises: Promise<void>[] = [];

			for (const [key, data] of this.pendingWrites.entries()) {
				const filePath = this.getFilePath(key);
				const writePromise = Bun.write(
					filePath,
					JSON.stringify({ timestamp: Date.now(), data }, null, 2),
				).then(() => {});
				writePromises.push(writePromise);
			}

			await Promise.all(writePromises);

			this.logger?.info(`Saved ${this.pendingWrites.size} snapshot files to ${this.currentDir}`);
			this.pendingWrites.clear();
		} catch (error) {
			this.logger?.error(
				`Failed to save snapshots: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	public async save(data: Snapshot) {
		for (const [key, value] of Object.entries(data)) {
			this.pendingWrites.set(key, value);
		}

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
		this.pendingWrites.set(key, data);
		await this.flushWrites();
	}

	/**
	 * Loads the most recent snapshot if it exists and is within the TTL window
	 */
	public async loadLatest() {
		try {
			const dirs = readdirSync(this.snapshotDir);
			if (!dirs.length) return null;

			const latestDir = dirs.sort().pop();
			if (!latestDir) return null;

			const snapshotPath = `${this.snapshotDir}/${latestDir}`;
			const files = readdirSync(snapshotPath);

			if (!files.length) return null;

			// Get the timestamp from the first file
			const firstFile = await Bun.file(`${snapshotPath}/${files[0]}`).json();
			const snapshotTimestamp = firstFile.timestamp;

			// Check if snapshot is within TTL
			const age = Date.now() - snapshotTimestamp;
			if (age > this.snapshotTTL) {
				this.logger?.info(
					`Snapshot is too old (${Math.round(age / 1000 / 60)} minutes), skipping load`,
				);
				return null;
			}

			const snapshot: Partial<Snapshot> = {
				timestamp: snapshotTimestamp,
			};

			for (const file of files) {
				const key = file.replace(".json", "") as keyof Snapshot;
				const filePath = `${snapshotPath}/${file}`;
				const fileContent = await Bun.file(filePath).json();
				snapshot[key] = fileContent.data;
			}

			this.snapshot = snapshot as Snapshot;
			this.logger?.info(
				`Loaded snapshot from ${new Date(snapshotTimestamp).toLocaleString()} (${Math.round(
					age / 1000 / 60,
				)} minutes old)`,
			);

			return this.snapshot;
		} catch (error) {
			this.logger?.error(
				`Failed to load snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);

			return null;
		} finally {
			this.setupSnapshotDir();
		}
	}

	private setupSnapshotDir() {
		if (!existsSync(this.snapshotDir)) {
			mkdirSync(this.snapshotDir, { recursive: true });
		}

		if (!existsSync(this.currentDir)) {
			mkdirSync(this.currentDir, { recursive: true });
		}
	}

	public async clear() {
		try {
			const dirs = readdirSync(this.snapshotDir);
			const clearPromises = dirs.map((dir: string) =>
				Bun.write(`${this.snapshotDir}/${dir}`, "").then(() => {}),
			);

			await Promise.all(clearPromises);
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

		await this.flushWrites();
	}
}
