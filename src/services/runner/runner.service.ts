import { extractErrorMessage } from "@/errors/";
import { BaseRunnerService } from "@/services/runner/base.service";
import { env, logger } from "@/utils";

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
 * - Development/Production mode support
 * - Snapshot-based state persistence
 * - Structured error handling
 *
 * @example
 * ```typescript
 * const runner = new Runner(options);
 * await runner.run();
 * ```
 */
export default class RunnerService extends BaseRunnerService {
	private printForkInfo(): void {
		logger.info(
			`Fork: ${env.REPO_FORK_OWNER}/${env.REPO_FORK_NAME} :: ` +
				`Upstream: ${env.REPO_UPSTREAM_OWNER}/${env.REPO_UPSTREAM_NAME}`,
		);
	}

	/**
	 * Executes the main translation workflow.
	 *
	 * ### Workflow:
	 *
	 * 1. Verifies GitHub token permissions
	 * 2. Loads or creates workflow snapshot (development only)
	 * 3. Fetches repository tree
	 * 4. Identifies files for translation
	 * 5. Processes files in batches
	 * 6. Reports results
	 *
	 * In production, also comments results on the specified issue.
	 *
	 * @throws {InitializationError} If token verification or fork sync fails
	 * @throws {ResourceLoadError} If repository content or glossary fetch fails
	 * @throws {APIError} If GitHub API operations fail
	 */
	public async run(): Promise<void> {
		try {
			logger.info("Starting translation workflow");

			this.printForkInfo();

			await this.verifyPermissions();
			const isForkSynced = await this.syncFork();

			if (env.NODE_ENV === "development") {
				await this.loadSnapshot(isForkSynced);
			}

			await this.fetchRepositoryTree();

			await this.fetchFilesToTranslate();

			await this.processInBatches(this.state.filesToTranslate, this.options.batchSize);

			this.state.processedResults = Array.from(this.metadata.results.values());

			if (env.NODE_ENV === "development") {
				await this.services.snapshot.append("processedResults", this.state.processedResults);
			}

			logger.info("Translation workflow completed successfully");

			if (this.shouldUpdateIssueComment) {
				await this.updateIssueWithResults();
			}

			if (env.NODE_ENV === "production") {
				await this.services.snapshot.clear();
			}
		} catch (error) {
			logger.error({ error: extractErrorMessage(error) }, "Translation workflow failed");

			throw error;
		} finally {
			await this.printFinalStatistics();
		}
	}
}
