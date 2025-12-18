import { TranslationError } from "@/errors/";
import RunnerService from "@/services/runner/runner.service";
import { logger as __logger, env } from "@/utils/";

import { name, version } from "../package.json";

const logger = __logger.child({ component: "main" });

if (import.meta.main) {
	try {
		logger.info(
			{ version, component: name, environment: env.NODE_ENV, targetLanguage: env.TARGET_LANGUAGE },
			"Starting workflow",
		);

		await workflow();

		logger.info("Workflow completed successfully");

		process.exit(0);
	} catch (error) {
		if (error instanceof TranslationError) {
			logger.fatal(
				{
					error,
					errorCode: error.code,
					operation: error.context.operation,
					metadata: error.context.metadata,
				},
				"Workflow failed with TranslationError",
			);
		} else {
			logger.fatal({ error }, "Workflow failed with unexpected error");
		}

		process.exit(1);
	}
}

/**
 * Main translation workflow execution.
 *
 * Creates and runs the Runner service which orchestrates the entire translation process.
 * Validates success rate against configured threshold and exits with appropriate code.
 */
async function workflow(): Promise<void> {
	const runner = new RunnerService();

	const statistics = await runner.run();

	if (env.MIN_SUCCESS_RATE > 0 && statistics.successRate < env.MIN_SUCCESS_RATE) {
		const successPercentage = (statistics.successRate * 100).toFixed(1);
		const thresholdPercentage = (env.MIN_SUCCESS_RATE * 100).toFixed(0);

		logger.fatal(
			{
				successRate: successPercentage,
				minSuccessRate: thresholdPercentage,
				successCount: statistics.successCount,
				failureCount: statistics.failureCount,
				totalCount: statistics.totalCount,
			},
			`Workflow failed: success rate ${successPercentage}% below threshold ${thresholdPercentage}%`,
		);

		throw new Error(
			`Workflow failed: success rate ${successPercentage}% ` +
				`is below minimum threshold of ${thresholdPercentage}%`,
		);
	}
}
