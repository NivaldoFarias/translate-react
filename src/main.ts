import { ApplicationError, mapError } from "@/errors/";
import { logger as baseLogger, env, validateSuccessRate } from "@/utils/";

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

	try {
		logger.info(
			{ version, component: name, environment: env.NODE_ENV, targetLanguage: env.TARGET_LANGUAGE },
			`"Starting workflow (v${version} - ${env.NODE_ENV})"`,
		);

		const statistics = await runnerService.run();
		logger.debug({ statistics }, "Workflow statistics");

		validateSuccessRate(statistics);

		logger.info("Workflow completed successfully");

		logger.debug("Exiting process with code 0");

		process.exit(0);
	} catch (_error) {
		const error = _error instanceof ApplicationError ? _error : mapError(_error, main.name);

		logger.fatal(error, "Workflow failed");

		process.exit(1);
	}
}
