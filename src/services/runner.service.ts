import type { ProcessedFileResult } from "@/types";
import type { Ora } from "ora";

import { GitHubService } from "@/services/github/";
import { SnapshotService } from "@/services/snapshot.service";
import { TranslatorService } from "@/services/translator.service";
import { validateEnv } from "@/utils/env.util";
import { LanguageDetector } from "@/utils/language-detector.util";

export interface RunnerOptions {
	targetLanguage: string;
	sourceLanguage: string;
}

export abstract class RunnerService {
	/**
	 * GitHub service instance for repository operations
	 */
	protected readonly github = new GitHubService();

	/**
	 * Translation service for content translation operations
	 */
	protected readonly translator: TranslatorService;

	/**
	 * Language detection service to identify content language
	 */
	protected readonly languageDetector: LanguageDetector;

	/**
	 * Snapshot manager to persist and retrieve workflow state
	 */
	protected readonly snapshotManager = new SnapshotService();

	/**
	 * Maximum number of files to process
	 * Limited in non-production environments for testing purposes
	 */
	protected get maxFiles(): number | undefined {
		return import.meta.env.NODE_ENV === "production" ? undefined : 10;
	}

	/**
	 * Statistics tracking for the translation process
	 */
	protected stats = {
		results: new Map<ProcessedFileResult["filename"], ProcessedFileResult>(),
		startTime: Date.now(),
	};

	/**
	 * Progress spinner for CLI feedback
	 */
	protected spinner: Ora | null = null;

	/**
	 * Cleanup handler for process termination
	 * Ensures graceful shutdown and cleanup of resources
	 */
	protected cleanup = () => {
		this.spinner?.stop();
		// Force exit after a timeout to ensure cleanup handlers run
		setTimeout(() => void process.exit(0), 1000);
	};

	/**
	 * Initializes the runner with environment validation and signal handlers
	 * Sets up process event listeners for graceful termination
	 */
	constructor(private readonly options: RunnerOptions) {
		try {
			validateEnv();
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}

		this.languageDetector = new LanguageDetector({
			sourceLanguage: this.options.sourceLanguage,
			targetLanguage: this.options.targetLanguage,
		});

		this.translator = new TranslatorService({
			sourceLanguage: this.options.sourceLanguage,
			targetLanguage: this.options.targetLanguage,
		});

		process.on("SIGINT", this.cleanup);
		process.on("SIGTERM", this.cleanup);
		process.on("uncaughtException", (error) => {
			console.error(`Uncaught exception: ${error.message}`);
			this.cleanup();
		});
	}

	protected get pullRequestDescription() {
		return `This pull request contains a translation of the referenced page into Portuguese (pt-BR). The translation was generated using OpenRouter _(model \`${import.meta.env.LLM_MODEL}\`)_.

Refer to the [source repository](https://github.com/${import.meta.env.REPO_OWNER}/translate-react) workflow that generated this translation for more details.

Feel free to review and suggest any improvements to the translation.`;
	}
}
