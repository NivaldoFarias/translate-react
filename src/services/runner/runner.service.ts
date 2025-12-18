import type { WorkflowStatistics } from "./runner.types";

import { extractErrorMessage } from "@/errors/";
import { BaseRunnerService } from "@/services/runner/base.service";
import { env, logger } from "@/utils/";

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
 * const runner = new RunnerService(options);
 * await runner.run();
 * ```
 */
export default class RunnerService extends BaseRunnerService {
	constructor() {
		super();

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

			await this.processInBatches(this.state.filesToTranslate, this.options.batchSize);

			this.state.processedResults = Array.from(this.metadata.results.values());

			this.logger.info("Translation workflow completed");

			if (this.shouldUpdateIssueComment) {
				await this.updateIssueWithResults();
			}

			return this.printFinalStatistics();
		} catch (error) {
			this.logger.error({ error: extractErrorMessage(error) }, "Translation workflow failed");

			throw error;
		}
	}
}
