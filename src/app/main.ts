import "@/app/utils/bootstrap-cli-overrides.util";

import { name, version } from "@package";

import type { Logger } from "pino";

import type { WorkflowStatistics } from "@/app/services/runner/types";

import { runnerService } from "@/app/composition";
import { baseLogger, buildOpenRouterRunUserId, env, setupSignalHandlers } from "@/app/utils/";
import { handleTopLevelError } from "@/shared/errors/";
import { appendGitHubActionsOutput } from "@/shared/utils/github-output.util";

if (import.meta.main) {
	await main();
}

/**
 * Main entry point for the application.
 *
 * Runs the translation workflow, handles top-level error logging and process exit codes.
 */
async function main() {
	const logger = baseLogger.child({ component: main.name });

	setupSignalHandlers((message, error) => {
		logger.error({ error, message }, "Signal handler error");
	});

	try {
		logger.info(
			{ version, component: name, environment: env.NODE_ENV, targetLanguage: env.TARGET_LANGUAGE },
			`"Starting workflow (v${version} - ${env.NODE_ENV})"`,
		);

		logger.debug(
			{
				openRouterUserId: buildOpenRouterRunUserId(),
				runConfig: {
					llmModel: env.LLM_MODEL,
					llmApiBaseUrl: env.LLM_API_BASE_URL,
					maxTokens: env.MAX_TOKENS,
					batchSize: env.BATCH_SIZE,
					maxLlmConcurrency: env.MAX_LLM_CONCURRENCY,
					maxRetryAttempts: env.MAX_RETRY_ATTEMPTS,
					llmMaxRequestsPerMinute: env.LLM_MAX_REQUESTS_PER_MINUTE,
					maskVerbatimLargeFences: env.MASK_VERBATIM_LARGE_FENCES,
					maskVerbatimLargeFencesMinTokens: env.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS,
					maxFilesPerRun: env.MAX_FILES_PER_RUN,
					maxOpenTranslationPrs: env.MAX_OPEN_TRANSLATION_PRS,
				},
			},
			"Workflow run configuration",
		);

		const statistics = await runnerService.run();

		logger.info(
			{
				successRate: statistics.successRate,
				successCount: statistics.successCount,
				failureCount: statistics.failureCount,
				totalCount: statistics.totalCount,
				totalPromptTokens: statistics.totalPromptTokens,
				totalCompletionTokens: statistics.totalCompletionTokens,
				totalEstimatedCostUsd: statistics.totalEstimatedCostUsd,
				filesWithReviewerWarnings: statistics.filesWithReviewerWarnings,
				advisoryIssuesByGuardId: statistics.advisoryIssuesByGuardId,
				filesLeftOverByCap: statistics.filesLeftOverByCap,
				filesHeldByCeiling: statistics.filesHeldByCeiling,
			},
			"Workflow finished",
		);

		reportBacklog(statistics, logger);

		process.exit(0);
	} catch (error) {
		handleTopLevelError(error, logger);
		process.exit(1);
	}
}

/**
 * Writes `has_backlog` to `GITHUB_OUTPUT` so `workflow.yml` holds `UPSTREAM_SHA_<LANG>`.
 *
 * A run has backlog when the run limits left files for later or a file failed. Holding the
 * SHA makes the next poll dispatch another run, which picks up where this one stopped.
 * Does nothing outside GitHub Actions.
 *
 * @param statistics Final workflow statistics
 * @param logger Logger for the backlog line
 */
function reportBacklog(statistics: WorkflowStatistics, logger: Logger) {
	const backlogFileCount =
		statistics.filesLeftOverByCap + statistics.filesHeldByCeiling + statistics.failureCount;
	const hasBacklog = backlogFileCount > 0;

	if (hasBacklog) {
		logger.info(
			{
				filesLeftOverByCap: statistics.filesLeftOverByCap,
				filesHeldByCeiling: statistics.filesHeldByCeiling,
				failureCount: statistics.failureCount,
			},
			"Backlog remains; upstream SHA stays put so the next poll runs again",
		);
	}

	if (env.GITHUB_OUTPUT) {
		appendGitHubActionsOutput("has_backlog", String(hasBacklog), env.GITHUB_OUTPUT);
	}
}
