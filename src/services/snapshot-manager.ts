import type { ProcessedFileResult } from "../runner";
import type { TranslationFile } from "../types";
import type Logger from "../utils/logger";

export interface Snapshot {
	timestamp: number;
	repositoryTree: any[];
	uncheckedFiles: TranslationFile[];
	filesToTranslate: TranslationFile[];
	processedResults: ProcessedFileResult[];
}

export class SnapshotManager {
	private readonly prefix = "snapshot";
	private readonly snapshotDir = ".snapshots";
	private readonly snapshotFile: string;

	constructor(private readonly logger?: Logger) {
		// Ensure checkpoint directory exists
		const dir = Bun.file(this.snapshotDir);
		if (!dir.exists()) {
			Bun.write(this.snapshotDir + "/.gitkeep", "");
		}

		this.snapshotFile = `${this.snapshotDir}/${this.prefix}-${Date.now()}.json`;
	}

	async save(data: Partial<Snapshot>) {
		try {
			const snapshot = { ...data, timestamp: Date.now() };
			await Bun.write(this.snapshotFile, JSON.stringify(snapshot, null, 2));
			this.logger?.info(`Snapshot saved to ${this.snapshotFile}`);
		} catch (error) {
			this.logger?.error(
				`Failed to save snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	async loadLatest(): Promise<Snapshot | null> {
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
			this.logger?.info(`Loaded snapshot from ${latestFile}`);

			return snapshotData as Snapshot;
		} catch (error) {
			this.logger?.error(
				`Failed to load snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			return null;
		}
	}

	async clear() {
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
}
