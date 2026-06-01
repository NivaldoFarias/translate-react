import "@/app/utils/bootstrap-cli-overrides.util";
import "@/app/global";

import { name, version } from "@package";

import { runnerService } from "@/app/composition";
import { logger as baseLogger, env, setupSignalHandlers } from "@/app/utils/";
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

		const statistics = await runnerService.run();

		logger.info(
			{
				successRate: statistics.successRate,
				successCount: statistics.successCount,
				failureCount: statistics.failureCount,
				totalCount: statistics.totalCount,
			},
			"Workflow finished",
		);

		process.exit(0);
	} catch (error) {
		handleTopLevelError(error, logger);
		process.exit(1);
	}
}
