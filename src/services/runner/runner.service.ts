import { RunnerService } from "@/services/runner/base.service";
import { extractErrorMessage } from "@/utils/errors.util";

/**
 * # Translation Workflow Runner
 *
 * Main orchestrator class that manages the entire translation process workflow.
 * Handles file processing, translation, GitHub operations, and progress tracking.
 *
 * The runner implements a batch processing system to efficiently handle multiple files
 * while providing real-time progress feedback through a CLI spinner.
 *
 * ## Features
 * - Batch processing with configurable size
 * - Real-time progress tracking
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
export default class Runner extends RunnerService {
	/**
	 * # Main Workflow Execution
	 *
	 * Executes the complete translation workflow:
	 * 1. Verifies GitHub token permissions
	 * 2. Loads or creates workflow snapshot (development only)
	 * 3. Fetches repository tree
	 * 4. Identifies files for translation
	 * 5. Processes files in batches
	 * 6. Reports results
	 *
	 * In production, also comments results on the specified issue
	 *
	 * @throws {InitializationError} If token verification or fork sync fails
	 * @throws {ResourceLoadError} If repository content or glossary fetch fails
	 * @throws {APIError} If GitHub API operations fail
	 */
	public async run() {
		try {
			this.spinner.start();

			await this.verifyPermissions();
			const isForkSynced = await this.syncFork();

			if (import.meta.env.NODE_ENV === "development") {
				await this.loadSnapshot(isForkSynced);
			}

			await this.fetchRepositoryTree();

			await this.fetchFilesToTranslate();

			await this.processInBatches(this.state.filesToTranslate, this.options.batchSize);

			this.state.processedResults = Array.from(this.stats.results.values());

			if (import.meta.env.NODE_ENV === "development") {
				await this.services.snapshot.append("processedResults", this.state.processedResults);
			}

			this.spinner.succeed("Translation completed");

			if (this.shouldUpdateIssueComment) {
				await this.updateIssueWithResults();
			}

			if (import.meta.env.NODE_ENV === "production") {
				await this.services.snapshot.clear();
			}
		} catch (error) {
			this.spinner.fail(extractErrorMessage(error));

			throw error;
		} finally {
			await this.printFinalStatistics();

			this.spinner.stop();
		}
	}
}
