import Bun from "bun";
import { z } from "zod";

import type { BunFile } from "bun";

import { ErrorHandler, ErrorSeverity } from "@/errors";
import Runner from "@/services/runner/runner.service";
import { parseCommandLineArgs } from "@/utils/parse-command-args.util";

/** Defines the expected structure and types for the runner options */
const runnerOptionsSchema = z.object({
	targetLanguage: z.string().min(2).max(5).default("pt"),
	sourceLanguage: z.string().min(2).max(5).default("en"),
	batchSize: z.coerce.number().positive().default(10),
});

if (import.meta.main) {
	const errorHandler = initializeErrorHandler(
		Bun.file(`logs/translate-react-${new Date().toISOString()}.log.json`),
	);

	const runTranslation = errorHandler.wrapAsync(
		async () => {
			const args = parseCommandLineArgs(
				["--target", "--source", "--batch-size"],
				runnerOptionsSchema,
			);

			const runner = new Runner(args);
			await runner.run();
		},
		{
			operation: "main",
			metadata: {
				component: "translate-react",
				version: process.env["npm_package_version"],
			},
		},
	);

	try {
		await runTranslation();

		process.exit(0);
	} catch (error) {
		process.exit(1);
	}
}

/**
 * Initializes the error handler with the default configuration
 *
 * @param logFile Optional log file to write errors to
 */
function initializeErrorHandler(logFile?: BunFile) {
	return ErrorHandler.getInstance({
		minSeverity: ErrorSeverity.INFO,
		logToFile: !!logFile,
		logFilePath: logFile?.name,
		customReporter: (error) => {
			if (error.context.sanity === ErrorSeverity.FATAL) {
				process.exit(1);
			}
		},
	});
}
