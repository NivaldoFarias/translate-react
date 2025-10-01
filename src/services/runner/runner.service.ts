import { extractErrorMessage } from "@/errors/error.handler";
import { RunnerService } from "@/services/runner/base.service";

/**
 * Main orchestrator class that manages the entire translation process workflow.
 * Handles file processing, translation, GitHub operations, and progress tracking.
 *
 * @remarks
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
	private printForkInfo() {
		this.spinner.info(
			`Fork: ${this.env.REPO_FORK_OWNER}/${this.env.REPO_FORK_NAME} :: ` +
				`Upstream: ${this.env.REPO_UPSTREAM_OWNER}/${this.env.REPO_UPSTREAM_NAME}`,
		);

		this.spinner.start();
	}

	/**
	 * Executes the main translation workflow.
	 *
	 * @remarks
	 * Workflow:
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
	public async run() {
		try {
			this.spinner.start();

			this.printForkInfo();

			await this.verifyPermissions();
			const isForkSynced = await this.syncFork();

			if (this.env.NODE_ENV === "development") {
				await this.loadSnapshot(isForkSynced);
			}

			await this.fetchRepositoryTree();

			await this.fetchFilesToTranslate();

			await this.processInBatches(this.state.filesToTranslate, this.options.batchSize);

			this.state.processedResults = Array.from(this.metadata.results.values());

			if (this.env.NODE_ENV === "development") {
				await this.services.snapshot.append("processedResults", this.state.processedResults);
			}

			this.spinner.succeed("Translation completed");

			if (this.shouldUpdateIssueComment) {
				await this.updateIssueWithResults();
			}

			if (this.env.NODE_ENV === "production") {
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
