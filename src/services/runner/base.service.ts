import type {
	PatchedRepositoryItem,
	ProcessedFileResult,
	RunnerOptions,
	RunnerServiceDependencies,
	RunnerState,
	WorkflowStatistics,
} from "./runner.types";

import {
	ApplicationError,
	createInitializationError,
	createResourceLoadError,
	ErrorCode,
} from "@/errors/";
import { env, logger, setupSignalHandlers } from "@/utils/";

import { FileDiscoveryManager } from "./file-discovery.manager";
import { PRManager } from "./pr.manager";
import { TranslationBatchManager } from "./translation-batch.manager";

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

	/** Injected service dependencies */
	protected readonly services: RunnerServiceDependencies;

	/** Statistics tracking for the translation process */
	protected metadata = {
		results: new Map<ProcessedFileResult["filename"], ProcessedFileResult>(),
		timestamp: Date.now(),
	};

	/** Manager instances for workflow orchestration */
	protected fileDiscovery: FileDiscoveryManager;
	protected translationBatch: TranslationBatchManager;
	protected readonly prManager: PRManager;

	/**
	 * Cleanup handler for process termination.
	 *
	 * Ensures graceful shutdown and cleanup of resources
	 */
	protected cleanup = () => {
		this.logger.info("Shutting down gracefully");

		setTimeout(() => void process.exit(0), 1000);
	};

	/**
	 * Initializes the runner with injected dependencies and signal handlers.
	 *
	 * Sets up process event listeners for graceful termination and initializes
	 * manager instances for file discovery, translation batching, and PR operations.
	 *
	 * @param services Injected service dependencies
	 * @param options Runner configuration options
	 */
	constructor(
		services: RunnerServiceDependencies,
		protected readonly options: RunnerOptions = {
			batchSize: env.BATCH_SIZE,
		},
	) {
		this.services = services;

		this.fileDiscovery = new FileDiscoveryManager(services);
		this.translationBatch = new TranslationBatchManager(
			services,
			new Map(),
			this.metadata.timestamp,
		);
		this.prManager = new PRManager(services, this.metadata.timestamp);

		setupSignalHandlers(this.cleanup, (message, error) => {
			this.logger.error({ error, message }, "Signal handler triggered during cleanup");
		});
	}

	/**
	 * Verifies LLM connectivity by testing the translator service.
	 *
	 * Calls {@link TranslatorService.testConnectivity} to verify LLM connectivity
	 *
	 * @throws {InitializationError} If LLM connectivity test fails
	 */
	protected async verifyLLMConnectivity(): Promise<void> {
		await this.services.translator.testConnectivity();
	}

	/**
	 * Verifies GitHub token permissions
	 *
	 * @throws {InitializationError} If token permissions verification fails
	 */
	protected async verifyPermissions(): Promise<void> {
		const hasPermissions = await this.services.github.repository.verifyTokenPermissions();

		if (!hasPermissions) {
			throw createInitializationError(
				"Token permissions verification failed",
				`${BaseRunnerService.name}.verifyTokenPermissions`,
			);
		}
	}

	/**
	 * Synchronizes the fork with the upstream repository
	 *
	 * @throws {InitializationError} If the fork synchronization fails
	 *
	 * @returns `true` if the fork is up to date, `false` otherwise
	 */
	protected async syncFork(): Promise<boolean> {
		this.logger.info("Checking fork existance and its status");

		await this.services.github.repository.forkExists();
		const isForkSynced = await this.services.github.repository.isForkSynced();

		if (!isForkSynced) {
			this.logger.info("Fork is out of sync, updating fork");

			const syncSuccess = await this.services.github.repository.syncFork();
			if (!syncSuccess) {
				throw createInitializationError(
					"Failed to sync fork with upstream repository",
					`${BaseRunnerService.name}.syncFork`,
				);
			}

			this.logger.info("Fork synchronized with upstream repository");
		} else {
			this.logger.info("Fork is up to date");
		}

		return isForkSynced;
	}

	/**
	 * Fetches the repository tree and glossary
	 *
	 * Uses tree comparison to only fetch files that differ between fork and upstream,
	 * significantly reducing the number of files that need processing.
	 *
	 * @throws {ResourceLoadError} If the repository tree or glossary fetch fails
	 */
	protected async fetchRepositoryTree(): Promise<void> {
		this.logger.info("Fetching repository content");
		const repositoryTree = await this.services.github.repository.compareRepositoryTrees();

		this.state.repositoryTree = repositoryTree.map((item) => {
			const filename = item.path?.split("/").pop() ?? "";

			return { ...item, filename };
		}) as PatchedRepositoryItem[];

		this.logger.info("Repository tree fetched. Fetching glossary");

		const glossary = await this.services.github.repository.fetchGlossary();

		if (!glossary) {
			throw createResourceLoadError("glossary", `${BaseRunnerService.name}.fetchRepositoryTree`);
		}

		this.services.translator.glossary = glossary;
		this.logger.info("Repository content and glossary fetched successfully");
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
	 */
	protected async fetchFilesToTranslate(): Promise<void> {
		if (this.state.filesToTranslate.length) {
			this.logger.info(
				`Found ${this.state.filesToTranslate.length} files to translate (from cache)`,
			);
			return;
		}

		const { filesToTranslate, invalidPRsByFile } = await this.fileDiscovery.discoverFiles(
			this.state.repositoryTree,
		);

		if (filesToTranslate.length === 0) {
			this.logger.error({ filesToTranslate, invalidPRsByFile }, "Found no files to translate");

			throw new ApplicationError(
				"Found no files to translate",
				ErrorCode.NO_FILES_TO_TRANSLATE,
				`${BaseRunnerService.name}.fetchFilesToTranslate`,
			);
		}

		this.logger.debug(
			{
				filesCount: filesToTranslate.length,
				filenames: filesToTranslate.map((file) => file.filename),
			},
			`Discovered ${filesToTranslate.length} files to translate after filtering`,
		);

		this.state.filesToTranslate = filesToTranslate;
		this.state.invalidPRsByFile = invalidPRsByFile;

		this.translationBatch = new TranslationBatchManager(
			this.services,
			invalidPRsByFile,
			this.metadata.timestamp,
		);
	}

	/** Updates the progress issue with the translation results */
	protected async updateIssueWithResults(): Promise<void> {
		await this.prManager.updateIssue(this.metadata.results, this.state.filesToTranslate);
	}

	/**
	 * Generates and displays final statistics for the translation workflow.
	 *
	 * Uses {@link PRManager.printFinalStatistics} to calculate and display:
	 * - Total files processed
	 * - Success/failure counts
	 * - Detailed error information for failed files
	 * - Total execution time
	 *
	 * @returns Workflow statistics summary
	 */
	protected printFinalStatistics(): WorkflowStatistics {
		return this.prManager.printFinalStatistics(this.metadata.results);
	}

	/**
	 * Processes files in batches to manage resources and provide progress feedback.
	 *
	 * Uses {@link TranslationBatchManager.processBatches} to:
	 * 1. Split files into manageable batches
	 * 2. Process each batch concurrently
	 * 3. Update progress in real-time
	 * 4. Report batch completion statistics
	 *
	 * @param batchSize Number of files to process simultaneously
	 */
	protected async processInBatches(batchSize = env.BATCH_SIZE): Promise<void> {
		this.metadata.results = await this.translationBatch.processBatches(
			this.state.filesToTranslate,
			batchSize,
		);
	}

	abstract run(): Promise<WorkflowStatistics>;
}
