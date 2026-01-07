import type {
	ProcessedFileResult,
	RunnerServiceDependencies,
	WorkflowStatistics,
} from "./runner.types";
import type { SetNonNullable } from "type-fest";

import { env, logger, RuntimeEnvironment } from "@/utils/";

import { TranslationFile } from "../translator.service";

/**
 * Manages pull request operations and workflow statistics reporting.
 *
 * Coordinates issue updates, final statistics generation, and formatted output
 * for translation workflow completion. Provides comprehensive reporting on
 * translation success rates and failure details.
 */
export class PRManager {
	private readonly logger = logger.child({ component: PRManager.name });

	/**
	 * Initializes the PR manager with service dependencies.
	 *
	 * @param services Injected service dependencies for GitHub operations
	 * @param workflowTimestamp Timestamp when workflow started for timing calculations
	 */
	constructor(
		private readonly services: RunnerServiceDependencies,
		private readonly workflowTimestamp: number,
	) {}

	/**
	 * Updates the progress issue with translation results.
	 *
	 * Posts a comment to the configured progress issue with detailed results
	 * of the translation workflow. Only executes in production environment
	 * and when a progress issue number is configured.
	 *
	 * @param processedResults Map of filename to processing result metadata
	 * @param filesToTranslate Original list of files that were candidates for translation
	 *
	 * @returns A `Promise` that resolves when the issue is updated
	 */
	async updateIssue(
		processedResults: Map<string, ProcessedFileResult>,
		filesToTranslate: TranslationFile[],
	): Promise<void> {
		if (!this.shouldUpdateIssueComment(processedResults)) {
			return;
		}

		this.logger.info("Commenting on issue");

		const comment = await this.services.github.content.commentCompiledResultsOnIssue(
			Array.from(processedResults.values()),
			filesToTranslate,
		);

		this.logger.info({ commentUrl: comment.html_url }, "Commented on translation issue");
	}

	/**
	 * Determines if the issue comment should be updated based on environment and results.
	 *
	 * @param results Map of processing results
	 *
	 * @returns `true` if the issue comment should be updated, `false` otherwise
	 */
	private shouldUpdateIssueComment(results: Map<string, ProcessedFileResult>): boolean {
		return !!(
			env.NODE_ENV === RuntimeEnvironment.Production &&
			env.PROGRESS_ISSUE_NUMBER &&
			results.size > 0
		);
	}

	/**
	 * Generates and displays final statistics for the translation workflow.
	 *
	 * Calculates success/failure counts, displays detailed error information
	 * for failed files, and reports overall workflow statistics including
	 * success rate and execution time.
	 *
	 * ### Statistics Reported
	 *
	 * - Total files processed
	 * - Success/failure counts
	 * - Detailed error information for failed files
	 * - Total execution time
	 *
	 * @param processedResults Map of filename to processing result metadata
	 *
	 * @returns Workflow statistics summary
	 */
	printFinalStatistics(processedResults: Map<string, ProcessedFileResult>): WorkflowStatistics {
		const elapsedTime = Math.ceil(Date.now() - this.workflowTimestamp);
		const results = Array.from(processedResults.values());

		const successCount = results.filter(({ error }) => !error).length;
		const failureCount = results.filter(({ error }) => !!error).length;

		const failedFiles = results.filter(({ error }) => !!error) as SetNonNullable<
			ProcessedFileResult,
			"error"
		>[];

		if (failedFiles.length > 0) {
			this.logger.warn(
				{
					failures: failedFiles.map(({ filename, error }) => ({ filename, error: error.message })),
				},
				`Failed files (${failedFiles.length})`,
			);
		}

		const totalCount = results.length;
		const successRate = totalCount > 0 ? successCount / totalCount : 0;

		this.logger.info(
			{
				successCount,
				failureCount,
				totalCount,
				elapsedTime: this.formatElapsedTime(elapsedTime),
				successRate,
			},
			"Final statistics",
		);

		return { successCount, failureCount, totalCount, successRate };
	}

	/**
	 * Formats a time duration in milliseconds to a human-readable string.
	 *
	 * Uses the {@link Intl.RelativeTimeFormat} API for localization.
	 *
	 * @param elapsedTime The elapsed time in milliseconds
	 *
	 * @returns A formatted duration string
	 */
	private formatElapsedTime(elapsedTime: number): string {
		const formatter = new Intl.RelativeTimeFormat("en", { numeric: "always", style: "long" });

		const seconds = Math.floor(elapsedTime / 1000);

		if (seconds < 60) {
			return formatter.format(seconds, "second").replace("in ", "");
		} else if (seconds < 3600) {
			return formatter.format(Math.floor(seconds / 60), "minute").replace("in ", "");
		} else {
			return formatter.format(Math.floor(seconds / 3600), "hour").replace("in ", "");
		}
	}
}
