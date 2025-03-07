import type { ProcessedFileResult } from "@/types";
import type { Ora } from "ora";

import { GitHubService } from "@/services/github/github.service";
import { SnapshotService } from "@/services/snapshot.service";
import { TranslatorService } from "@/services/translator.service";
import { extractErrorMessage, setupSignalHandlers, validateEnv } from "@/utils/";

export interface RunnerOptions {
	targetLanguage: string;
	sourceLanguage: string;
}

export abstract class RunnerService {
	protected readonly services: {
		/** GitHub service instance for repository operations */
		github: GitHubService;

		/** Translation service for content translation operations */
		translator: TranslatorService;

		/** Snapshot manager to persist and retrieve workflow state */
		snapshot: SnapshotService;
	};

	/** Statistics tracking for the translation process */
	protected stats = {
		results: new Map<ProcessedFileResult["filename"], ProcessedFileResult>(),
		timestamp: Date.now(),
	};

	/** Progress spinner for CLI feedback */
	protected spinner: Ora | null = null;

	/**
	 * Cleanup handler for process termination.
	 * Ensures graceful shutdown and cleanup of resources
	 */
	protected cleanup = () => {
		this.spinner?.stop();

		setTimeout(() => void process.exit(0), 1000);
	};

	/**
	 * Initializes the runner with environment validation and signal handlers
	 * Sets up process event listeners for graceful termination
	 */
	constructor(protected readonly options: RunnerOptions) {
		try {
			validateEnv();
		} catch (error) {
			console.error(extractErrorMessage(error));
			process.exit(1);
		}

		this.services = {
			github: new GitHubService(),
			translator: new TranslatorService({
				source: this.options.sourceLanguage,
				target: this.options.targetLanguage,
			}),
			snapshot: new SnapshotService(),
		};

		if (import.meta.env.FORCE_SNAPSHOT_CLEAR) {
			this.services.snapshot.clear();
		}

		setupSignalHandlers(this.cleanup);
	}

	protected get pullRequestDescription() {
		return `This pull request contains a translation of the referenced page into Portuguese (pt-BR). The translation was generated using LLMs _(Open Router API :: model \`${import.meta.env.LLM_MODEL}\`)_.

Refer to the [source repository](https://github.com/${import.meta.env.REPO_FORK_OWNER}/translate-react) workflow that generated this translation for more details.

Feel free to review and suggest any improvements to the translation.`;
	}
}
