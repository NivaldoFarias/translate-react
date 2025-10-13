import { TranslationError } from "@/errors";
import RunnerService from "@/services/runner/runner.service";
import { env, logger } from "@/utils";

import { name, version } from "../package.json";

if (import.meta.main) {
	try {
		logger.info(
			{ version, component: name, environment: env.NODE_ENV, targetLanguage: env.TARGET_LANGUAGE },
			"Starting translation workflow",
		);

		await workflow();

		logger.info("Translation workflow completed successfully");
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
				"Translation workflow failed with TranslationError",
			);
		} else {
			logger.fatal({ error }, "Translation workflow failed with unexpected error");
		}

		process.exit(1);
	}
}

/**
 * Main translation workflow execution.
 *
 * Creates and runs the Runner service which orchestrates the entire translation process.
 *
 * @throws {TranslationError} If any critical error occurs during translation
 */
async function workflow(): Promise<void> {
	const runner = new RunnerService();

	await runner.run();
}
