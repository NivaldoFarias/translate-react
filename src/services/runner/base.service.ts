import type { ProcessedFileResult } from "@/types";
import type { Ora } from "ora";

import { GitHubService } from "@/services/github/github.service";
import { SnapshotService } from "@/services/snapshot.service";
import { TranslatorService } from "@/services/translator.service";
import { extractErrorMessage, LanguageDetector, setupSignalHandlers, validateEnv } from "@/utils/";

export interface RunnerOptions {
	targetLanguage: string;
	sourceLanguage: string;
}

export abstract class RunnerService {
	/** GitHub service instance for repository operations */
	protected readonly github = new GitHubService();

	/** Translation service for content translation operations */
	protected readonly translator: TranslatorService;

	/** Language detection service to identify content language */
	protected readonly languageDetector: LanguageDetector;

	/** Snapshot manager to persist and retrieve workflow state */
	protected readonly snapshotManager = new SnapshotService();

	/**
	 * Maximum number of files to process
	 * Limited in non-production environments for testing purposes
	 */
	protected get maxFiles(): number | undefined {
		return import.meta.env.NODE_ENV === "production" ? undefined : 10;
	}

	/** Statistics tracking for the translation process */
	protected stats = {
		results: new Map<ProcessedFileResult["filename"], ProcessedFileResult>(),
		startTime: Date.now(),
	};

	/** Progress spinner for CLI feedback */
	protected spinner: Ora | null = null;

	/**
	 * Cleanup handler for process termination
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

		this.languageDetector = new LanguageDetector({
			source: this.options.sourceLanguage,
			target: this.options.targetLanguage,
		});

		this.translator = new TranslatorService({
			source: this.options.sourceLanguage,
			target: this.options.targetLanguage,
		});

		setupSignalHandlers(this.cleanup);
	}

	protected get pullRequestDescription() {
		return `This pull request contains a translation of the referenced page into Portuguese (pt-BR). The translation was generated using OpenRouter _(model \`${import.meta.env.LLM_MODEL}\`)_.

Refer to the [source repository](https://github.com/${import.meta.env.REPO_FORK_OWNER}/translate-react) workflow that generated this translation for more details.

Feel free to review and suggest any improvements to the translation.`;
	}
}
