import type { RunnerOptions, RunnerServiceDependencies, WorkflowStatistics } from "./runner.types";

import { extractErrorMessage } from "@/errors/";
import { env, logger } from "@/utils/";

import { languageCacheService } from "../cache";
import { githubService } from "../github";
import { languageDetectorService } from "../language-detector.service";
import { localeService } from "../locale/locale.service";
import { translatorService } from "../translator.service";

import { BaseRunnerService } from "./base.service";

/**
 * Main orchestrator class that manages the entire translation process workflow.
 *
 * - Handles file processing, translation, GitHub operations, and progress tracking.
 * - The runner implements a batch processing system to efficiently handle multiple files
 * while providing real-time progress feedback through structured logging.
 *
 * ### Features
 *
 * - Batch processing with configurable size
 * - Real-time progress tracking via Pino logger
 * - Structured error handling
 *
 * @example
 * ```typescript
 * const runner = new RunnerService(dependencies, options);
 * await runner.run();
 * ```
 */
export class RunnerService extends BaseRunnerService {
	/**
	 * Creates a new RunnerService with injected dependencies.
	 *
	 * @param services Injected service dependencies
	 * @param options Runner configuration options
	 */
	constructor(services: RunnerServiceDependencies, options?: RunnerOptions) {
		super(services, options);

		this.logger = logger.child({ component: RunnerService.name });
	}

	/**
	 * Executes the main translation workflow.
	 *
	 * ### Workflow
	 *
	 * 1. Verifies LLM connectivity
	 * 2. Verifies GitHub token permissions
	 * 3. Syncs fork with upstream
	 * 4. Fetches repository tree
	 * 5. Identifies files for translation
	 * 6. Processes files in batches
	 * 7. Reports results
	 *
	 * @returns Statistics about the workflow execution (success/failure counts)
	 */
	public async run(): Promise<WorkflowStatistics> {
		try {
			this.logger.info("Starting translation workflow");

			this.logger.info(
				`Fork: ${env.REPO_FORK_OWNER}/${env.REPO_FORK_NAME} :: ` +
					`Upstream: ${env.REPO_UPSTREAM_OWNER}/${env.REPO_UPSTREAM_NAME}`,
			);

			await this.verifyLLMConnectivity();
			await this.verifyPermissions();
			await this.syncFork();

			await this.fetchRepositoryTree();

			await this.fetchFilesToTranslate();
			await this.processInBatches();

			this.state.processedResults = Array.from(this.metadata.results.values());

			this.logger.info("Translation workflow completed");

			await this.updateIssueWithResults();

			return this.printFinalStatistics();
		} catch (error) {
			this.logger.error({ error: extractErrorMessage(error) }, "Translation workflow failed");

			throw error;
		}
	}
}

export const runnerService = new RunnerService({
	github: githubService,
	translator: translatorService,
	languageCache: languageCacheService,
	locale: localeService,
	languageDetector: languageDetectorService,
});
