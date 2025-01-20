import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import Bun from "bun";

import type { ProcessedFileResult } from "../runner";
import type { TranslationFile } from "../types";

interface CheckpointData {
	timestamp: number;
	repositoryTree: any[];
	uncheckedFiles: TranslationFile[];
	filesToTranslate: TranslationFile[];
	processedResults: ProcessedFileResult[];
}

export class CheckpointManager {
	private readonly checkpointDir = "checkpoints";
	private readonly checkpointFile: string;

	constructor(private readonly logger?: Console) {
		// Ensure checkpoint directory exists
		if (!existsSync(this.checkpointDir)) {
			mkdirSync(this.checkpointDir, { recursive: true });
		}

		this.checkpointFile = join(this.checkpointDir, `checkpoint-${Date.now()}.json`);
	}

	async saveCheckpoint(data: Partial<CheckpointData>) {
		try {
			await Bun.write(
				this.checkpointFile,
				JSON.stringify({ ...data, timestamp: Date.now() }, null, 2),
			);
			this.logger?.info(`Checkpoint saved to ${this.checkpointFile}`);
		} catch (error) {
			this.logger?.error(
				`Failed to save checkpoint: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	async loadLatestCheckpoint(): Promise<CheckpointData | null> {
		try {
			const files = await Bun.file(this.checkpointDir).json();
			if (!files.length) return null;

			// Get the most recent checkpoint file
			const latestCheckpoint = files
				.filter((f: string) => f.startsWith("checkpoint-"))
				.sort()
				.pop();

			if (!latestCheckpoint) return null;

			const checkpointData = await Bun.file(join(this.checkpointDir, latestCheckpoint)).json();
			this.logger?.info(`Loaded checkpoint from ${latestCheckpoint}`);

			return checkpointData;
		} catch (error) {
			this.logger?.error(
				`Failed to load checkpoint: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			return null;
		}
	}

	async clearCheckpoints() {
		try {
			const files = await Bun.file(this.checkpointDir).json();
			await Promise.all(
				files
					.filter((f: string) => f.startsWith("checkpoint-"))
					.map((f: string) => Bun.write(join(this.checkpointDir, f), "")),
			);
			this.logger?.info("Cleared all checkpoints");
		} catch (error) {
			this.logger?.error(
				`Failed to clear checkpoints: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}
