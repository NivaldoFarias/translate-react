import "@/app/utils/bootstrap-cli-overrides.util";

import { name, version } from "@package";

import { runnerService } from "@/app/composition";
import {
	logger as baseLogger,
	buildOpenRouterRunUserId,
	env,
	setupSignalHandlers,
} from "@/app/utils/";
import { handleTopLevelError } from "@/shared/errors/";

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
			},
			"Workflow finished",
		);

		process.exit(0);
	} catch (error) {
		handleTopLevelError(error, logger);
		process.exit(1);
	}
}
