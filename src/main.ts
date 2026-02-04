import { handleTopLevelError } from "@/errors/";
import { logger as baseLogger, env, setupSignalHandlers, validateSuccessRate } from "@/utils/";

import { name, version } from "../package.json";

import { runnerService } from "./services";

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

		validateSuccessRate(statistics);

		logger.info("Workflow completed successfully");

		process.exit(0);
	} catch (error) {
		handleTopLevelError(error, logger);
		process.exit(1);
	}
}
