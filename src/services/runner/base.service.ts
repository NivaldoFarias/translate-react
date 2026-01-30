import { sleep } from "bun";

import type {
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
	RepositoryTreeItem,
	RunnerOptions,
	RunnerServiceDependencies,
	RunnerState,
	WorkflowStatistics,
} from "./runner.types";

import { ApplicationError, ErrorCode } from "@/errors/";
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
	protected cleanup = async () => {
		this.logger.info("Shutting down gracefully");

		await sleep(1000);

		process.exit(0);
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
	 * @see {@link TranslatorService.testConnectivity}
	 */
	protected async verifyLLMConnectivity(): Promise<void> {
		await this.services.translator.testConnectivity();
	}

	/**
	 * Verifies GitHub token permissions
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.InitializationError} If token permissions verification fails
	 */
	protected async verifyPermissions(): Promise<void> {
		this.logger.info("Verifying GitHub token permissions");

		const hasPermissions = await this.services.github.verifyTokenPermissions();

		if (!hasPermissions) {
			this.logger.error("GitHub token permissions verification failed");

			throw new ApplicationError(
				"Token permissions verification failed",
				ErrorCode.InitializationError,
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
		this.logger.info("Checking fork existance and its status");

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
	 * Fetches the upstream repository tree and glossary for translation processing.
	 *
	 * Retrieves all candidate files from upstream.
	 */
	protected async fetchRepositoryTree(): Promise<void> {
		this.logger.info("Fetching repository content");

		const repositoryTree = await this.services.github.getRepositoryTree("upstream");
		this.logger.info({ itemCount: repositoryTree.length }, "Repository tree fetched from upstream");

		this.state.repositoryTree = this.patchRepositoryItem(repositoryTree);

		this.logger.info(
			{ before: repositoryTree.length, after: this.state.repositoryTree.length },
			"Repository tree item's filenames patched successfully",
		);

		this.services.translator.glossary = await this.fetchGlossary();

		this.logger.info("Repository content and glossary fetched successfully");
	}

	/**
	 * Fetches the glossary file from the repository.
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.ResourceLoadError} If the glossary fails to load
	 */
	private async fetchGlossary(): Promise<string> {
		this.logger.debug("Fetching glossary from repository");

		const glossary = await this.services.github.fetchGlossary();

		if (!glossary) {
			throw new ApplicationError(
				"Glossary is empty or failed to load",
				ErrorCode.ResourceLoadError,
				`${BaseRunnerService.name}.${this.fetchGlossary.name}`,
			);
		}

		this.logger.debug({ glossary }, "Repository content and glossary fetched successfully");

		return glossary;
	}

	/**
	 * Patches repository tree item's filenames extracted from paths.
	 *
	 * @param repositoryTree Array of repository tree items
	 *
	 * @returns Array of repository items with patched filenames
	 */
	private patchRepositoryItem(repositoryTree: RepositoryTreeItem[]): PatchedRepositoryTreeItem[] {
		this.logger.debug("Patching repository item filenames");

		const patchedRepositoryTree = repositoryTree
			.map((item) => {
				const filename = item.path.split("/").pop() ?? "";

				return { ...item, filename };
			})
			.filter(
				(item) => !!item.filename && !!item.sha && !!item.path,
			) as PatchedRepositoryTreeItem[];

		this.logger.debug(
			{
				results: repositoryTree.map((item) => {
					const match = patchedRepositoryTree.find((patched) => patched.sha === item.sha);

					return { original: item.path, patched: match?.filename ?? "N/A" };
				}),
			},
			"Repository item filenames patched successfully",
		);

		return patchedRepositoryTree;
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
	 * @throws {ApplicationError} with {@link ErrorCode.NoFilesToTranslate} If no files are found to translate
	 */
	protected async fetchFilesToTranslate(): Promise<void> {
		this.logger.info("Discovering files to translate");

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
			throw new ApplicationError(
				"Found no files to translate",
				ErrorCode.NoFilesToTranslate,
				`${BaseRunnerService.name}.${this.fetchFilesToTranslate.name}`,
				{ filesToTranslate, invalidPRsByFile },
			);
		}

		this.logger.info(
			{ filesCount: filesToTranslate.length },
			`Discovered ${filesToTranslate.length} files to translate after filtering`,
		);

		this.state.filesToTranslate = filesToTranslate;
		this.state.invalidPRsByFile = invalidPRsByFile;

		this.translationBatch = new TranslationBatchManager(
			this.services,
			invalidPRsByFile,
			this.metadata.timestamp,
		);

		this.logger.debug("Completed setting up translation batch manager and state update");
	}

	/** Updates the progress issue with the translation results */
	protected async updateIssueWithResults(): Promise<void> {
		await this.prManager.updateIssue(this.metadata.results, this.state.filesToTranslate);
	}

	/**
	 * Generates and displays final statistics for the translation workflow.
	 *
	 * @returns Workflow statistics summary
	 *
	 * @see {@link PRManager.printFinalStatistics}
	 */
	protected printFinalStatistics(): WorkflowStatistics {
		return this.prManager.printFinalStatistics(this.metadata.results);
	}

	/**
	 * Processes files in batches to manage resources and provide progress feedback.
	 *
	 * @param batchSize Number of files to process simultaneously
	 *
	 * @see {@link TranslationBatchManager.processBatches}
	 */
	protected async processInBatches(batchSize = env.BATCH_SIZE): Promise<void> {
		this.metadata.results = await this.translationBatch.processBatches(
			this.state.filesToTranslate,
			batchSize,
		);
	}

	abstract run(): Promise<WorkflowStatistics>;
}
