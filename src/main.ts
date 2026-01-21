import { ApplicationError, mapError } from "@/errors/";
import { createServiceConfigFromEnv, ServiceFactory } from "@/services/";
import { logger as baseLogger, env, validateSuccessRate } from "@/utils/";

import { name, version } from "../package.json";

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

		await workflow();

		logger.info("Workflow completed successfully");

		logger.debug("Exiting process with code 0");

		process.exit(0);
	} catch (error) {
		const mappedError = error instanceof ApplicationError ? error : mapError(error, main.name);

		logger.fatal(mappedError, "Workflow failed with ApplicationError");

		logger.debug("Exiting process with code 1");

		process.exit(1);
	}
}

/**
 * Main translation workflow execution.
 *
 * Creates services via {@link ServiceFactory} (composition root) and runs the
 * translation workflow. Validates success rate against configured threshold.
 */
async function workflow(): Promise<void> {
	const logger = baseLogger.child({ component: workflow.name });
	logger.debug("Creating service configuration from environment variables");

	const config = createServiceConfigFromEnv();
	logger.debug({ config }, "Creating service factory with provided configuration");

	const factory = new ServiceFactory(config);
	logger.debug("Creating runner service from factory");

	const runner = factory.createRunnerService();
	logger.debug("Running the translation workflow");

	const statistics = await runner.run();
	logger.debug({ statistics }, "Workflow statistics");

	validateSuccessRate(statistics);
}
