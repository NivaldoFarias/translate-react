import { sleep } from "bun";

import type {
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
	RepositoryTreeItem,
} from "@/app/services/github/types";
import type { PrFilterResult, WorkflowStatistics } from "@/app/services/runner/types";

import type { RunnerOptions, RunnerServiceDependencies, RunnerState } from "./runner.types";

import { env, logger, registerCleanup } from "@/app/utils/";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

import { FileDiscoveryManager, PRManager, TranslationBatchManager } from "./workflow";

/**
 * Base class for translation workflow runners.
 *
 * Provides core workflow orchestration using specialized managers for file discovery,
 * translation batching, and PR operations. Subclasses implement the `run()` method
 * to define specific workflow execution strategies.
 */
export abstract class BaseRunnerService {
	protected logger = logger.child({ component: BaseRunnerService.name });

	/**
	 * Maintains the current state of the translation workflow.
	 *
	 * Tracks repository tree, files to translate, and invalid PRs for notification
	 */
	protected state: RunnerState = {
		repositoryTree: [],
		filesToTranslate: [],
		processedResults: [],
		timestamp: Date.now(),
	};

	/** Statistics tracking for the translation process */
	protected metadata = {
		results: new Map<ProcessedFileResult["filename"], ProcessedFileResult>(),
		timestamp: Date.now(),
	};

	protected readonly managers: {
		fileDiscovery: FileDiscoveryManager;
		translationBatch: TranslationBatchManager;
		prManager: PRManager;
	};

	/**
	 * Cleanup handler for process termination.
	 *
	 * Ensures graceful shutdown and cleanup of resources
	 */
	protected cleanup = async () => {
		this.logger.info("Shutting down gracefully");

		await sleep(1_000);

		process.exit(0);
	};

	/**
	 * Initializes the runner with injected dependencies.
	 *
	 * Registers cleanup handler for graceful termination and initializes
	 * manager instances for file discovery, translation batching, and PR operations.
	 *
	 * @param services Injected service dependencies
	 * @param options Runner configuration options
	 */
	constructor(
		/** Injected service dependencies */
		protected readonly services: RunnerServiceDependencies,
		protected readonly options: RunnerOptions = {
			batchSize: env.BATCH_SIZE,
		},
	) {
		this.managers = {
			fileDiscovery: new FileDiscoveryManager(services),
			translationBatch: new TranslationBatchManager(services, new Map(), this.metadata.timestamp),
			prManager: new PRManager(services, this.metadata.timestamp),
		};

		registerCleanup(async () => {
			try {
				await this.cleanup();
			} catch (error) {
				this.logger.error({ error }, "Signal handler triggered during cleanup");
			}
		});
	}

	/**
	 * Verifies LLM connectivity by testing the translator service.
	 *
	 * @see {@link TranslatorService.testConnectivity}
	 */
	protected async verifyLLMConnectivity(): Promise<void> {
		await this.services.translator.testConnectivity();
	}

	/**
	 * Verifies GitHub token permissions
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.InsufficientPermissions} when the token lacks required scopes
	 */
	protected async verifyPermissions(): Promise<void> {
		const hasPermissions = await this.services.github.verifyTokenPermissions();

		if (!hasPermissions) {
			this.logger.error("GitHub token permissions verification failed");

			throw new ApplicationError(
				"Token permissions verification failed",
				ErrorCode.InsufficientPermissions,
				`${BaseRunnerService.name}.${this.verifyPermissions.name}`,
				{ hasPermissions },
			);
		}

		this.logger.info("GitHub token permissions verified successfully");
	}

	/**
	 * Synchronizes the fork with the upstream repository
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.InitializationError} If the fork synchronization fails
	 *
	 * @returns `true` if the fork is up to date, `false` otherwise
	 */
	protected async syncFork(): Promise<boolean> {
		await this.services.github.forkExists();
		const isForkSynced = await this.services.github.isForkSynced();

		if (!isForkSynced) {
			this.logger.info("Fork is out of sync, updating fork");

			const syncSuccess = await this.services.github.syncFork();
			if (!syncSuccess) {
				this.logger.error({ isForkSynced, syncSuccess }, "Fork synchronization failed");

				throw new ApplicationError(
					"Failed to sync fork with upstream repository",
					ErrorCode.InitializationError,
					`${BaseRunnerService.name}.${this.syncFork.name}`,
					{ isForkSynced, syncSuccess },
				);
			}

			this.logger.info("Fork synchronized with upstream repository");
		} else {
			this.logger.info("Fork is up to date");
		}

		return isForkSynced;
	}

	/**
	 * Fetches the upstream repository tree and translation guidelines for translation processing.
	 *
	 * Retrieves all candidate files from upstream.
	 */
	protected async fetchRepositoryTree(): Promise<void> {
		const repositoryTree = await this.services.github.getRepositoryTree("upstream");

		this.state.repositoryTree = this.patchRepositoryItem(repositoryTree);

		this.services.translator.translationGuidelines = await this.fetchTranslationGuidelinesFile();

		const hasGuidelines = this.services.translator.translationGuidelines !== null;
		this.logger.info(
			{ hasGuidelines },
			"Repository tree fetched" + (hasGuidelines ? " with translation guidelines" : ""),
		);
	}

	/**
	 * Fetches the translation guidelines file from the repository.
	 *
	 * Uses auto-discovery to find common filenames (`GLOSSARY.md`, `TRANSLATION.md`, etc.)
	 * unless `TRANSLATION_GUIDELINES_FILE` env var is explicitly configured.
	 *
	 * @returns The translation guidelines file content, or `null` if not found
	 */
	private async fetchTranslationGuidelinesFile(): Promise<string | null> {
		const translationGuidelines = await this.services.github.fetchTranslationGuidelinesFile();

		if (!translationGuidelines) {
			this.logger.warn(
				"No translation guidelines file found - translations may lack terminology consistency",
			);
			return null;
		}

		this.logger.debug(
			{ contentLength: translationGuidelines.length },
			"Translation guidelines file loaded successfully",
		);

		return translationGuidelines;
	}

	/**
	 * Patches repository tree item's filenames extracted from paths.
	 *
	 * @param repositoryTree Array of repository tree items
	 *
	 * @returns Array of repository items with patched filenames
	 */
	private patchRepositoryItem(repositoryTree: RepositoryTreeItem[]): PatchedRepositoryTreeItem[] {
		return repositoryTree
			.map((item) => {
				const filename = item.path.split("/").pop() ?? "";

				return { ...item, filename };
			})
			.filter(
				(item) => !!item.filename && !!item.sha && !!item.path,
			) as PatchedRepositoryTreeItem[];
	}

	/**
	 * Rebuilds the translation batch workflow stage with invalid-PR metadata, regardless of whether
	 * `filesToTranslate` came from discovery or a pre-filled {@link state}.
	 *
	 * @param invalidPRsByFile Paths to open PRs that need conflict messaging in new PR bodies
	 */
	private rebuildTranslationBatchManager(invalidPRsByFile: PrFilterResult["invalidPRsByFile"]) {
		this.managers.translationBatch = new TranslationBatchManager(
			this.services,
			invalidPRsByFile,
			this.metadata.timestamp,
		);
	}

	/**
	 * Fetches and filters files that need translation through a multi-stage pipeline.
	 *
	 * Orchestrates the complete file discovery workflow using {@link FileDiscoveryManager}
	 * to coordinate cache checks, PR filtering, content fetching, and language detection.
	 *
	 * ### Pipeline Stages
	 *
	 * 1. **Language cache lookup**: Queries cache to skip known translated files
	 * 2. **PR existence check**: Validates existing PRs to skip files with valid translations
	 * 3. **Content fetching**: Downloads file content in parallel batches from GitHub
	 * 4. **Language detection**: Analyzes content and updates cache with detection results
	 *
	 * ### Invalid PR Tracking
	 *
	 * Files with existing PRs that have merge conflicts are identified and stored in
	 * {@link state.invalidPRsByFile} for notification in new PR descriptions.
	 *
	 * @returns `true` when there is at least one file to translate; `false` when discovery
	 * produced no candidates, in which case the caller should skip batch translation.
	 */
	protected async fetchFilesToTranslate() {
		if (this.state.filesToTranslate.length) {
			this.logger.info(
				`Found ${this.state.filesToTranslate.length} files to translate (from cache)`,
			);
			this.rebuildTranslationBatchManager(this.state.invalidPRsByFile ?? new Map());
			return true;
		}

		const { filesToTranslate, invalidPRsByFile } = await this.managers.fileDiscovery.discoverFiles(
			this.state.repositoryTree,
		);

		if (filesToTranslate.length === 0) {
			this.logger.info(
				{ invalidPRFileCount: invalidPRsByFile.size },
				"No files to translate after discovery; skipping batch translation",
			);
			return false;
		}

		this.logger.info(
			{ filesCount: filesToTranslate.length },
			`Discovered ${filesToTranslate.length} files to translate after filtering`,
		);

		this.state.filesToTranslate = filesToTranslate;
		this.state.invalidPRsByFile = invalidPRsByFile;

		this.rebuildTranslationBatchManager(invalidPRsByFile);

		return true;
	}

	/** Updates the progress issue with the translation results */
	protected async updateIssueWithResults(): Promise<void> {
		await this.managers.prManager.updateIssue(this.metadata.results, this.state.filesToTranslate);
	}

	/**
	 * Generates and displays final statistics for the translation workflow.
	 *
	 * @returns Workflow statistics summary
	 *
	 * @see {@link PRManager.printFinalStatistics}
	 */
	protected printFinalStatistics(): WorkflowStatistics {
		return this.managers.prManager.printFinalStatistics(this.metadata.results);
	}

	/**
	 * Processes files in batches to manage resources and provide progress feedback.
	 *
	 * @param batchSize Number of files to process simultaneously
	 *
	 * @see {@link TranslationBatchManager.processBatches}
	 */
	protected async processInBatches(batchSize = env.BATCH_SIZE): Promise<void> {
		this.metadata.results = await this.managers.translationBatch.processBatches(
			this.state.filesToTranslate,
			batchSize,
		);
	}

	abstract run(): Promise<WorkflowStatistics>;
}
