import Bun from "bun";

import type { BunFile } from "bun";

import { ErrorHandler, ErrorSeverity } from "@/errors";
import Runner from "@/services/runner/runner.service";
import { parseCommandLineArgs } from "@/utils/parse-command-args.util";

if (import.meta.main) {
	const errorHandler = initializeErrorHandler(Bun.file("logs/translate-react.log"));

	const runTranslation = errorHandler.wrapAsync(
		async () => {
			const args = parseCommandLineArgs();
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
			if (error.context.severity === ErrorSeverity.FATAL) {
				process.exit(1);
			}
		},
	});
}
