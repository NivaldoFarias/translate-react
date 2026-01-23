import type { SetNonNullable } from "type-fest";

import type {
	ProcessedFileResult,
	RunnerServiceDependencies,
	WorkflowStatistics,
} from "./runner.types";

import { ApplicationError } from "@/errors/";
import { mapError } from "@/errors/error.helper";
import { formatElapsedTime, logger } from "@/utils/";

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
	public async updateIssue(
		processedResults: Map<string, ProcessedFileResult>,
		filesToTranslate: TranslationFile[],
	): Promise<void> {
		try {
			this.logger.info(
				{ processedResults: processedResults.size, filesToTranslate: filesToTranslate.length },
				"Commenting on issue",
			);

			const comment = await this.services.github.content.commentCompiledResultsOnIssue(
				Array.from(processedResults.values()),
				filesToTranslate,
			);

			if (!comment) {
				this.logger.warn("No comment was created on the translation issue");
				return;
			}

			this.logger.info({ commentUrl: comment.html_url }, "Commented on translation issue");
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${PRManager.name}.${this.updateIssue.name}`, {
				processedResults,
				filesToTranslate,
			});
		}
	}

	/**
	 * Generates and displays final statistics for the translation workflow.
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
	public printFinalStatistics(
		processedResults: Map<string, ProcessedFileResult>,
	): WorkflowStatistics {
		try {
			this.logger.info({ processedResults }, "Generating final workflow statistics from results");

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
						failures: failedFiles.map(({ filename, error }) => ({
							filename,
							error: error.message,
						})),
					},
					`Failed files (${failedFiles.length})`,
				);
			}

			this.logger.debug(
				{ elapsedTime, results, successCount, failureCount, failedFiles },
				"Computed workflow statistics",
			);

			const totalCount = results.length;
			const successRate = totalCount > 0 ? successCount / totalCount : 0;

			const workflowStats: WorkflowStatistics = {
				successCount,
				failureCount,
				totalCount,
				successRate,
			};

			this.logger.info(
				{ ...workflowStats, elapsedTime: formatElapsedTime(elapsedTime) },
				"Final statistics",
			);

			return workflowStats;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${PRManager.name}.${this.printFinalStatistics.name}`, {
				processedResults,
			});
		}
	}
}
