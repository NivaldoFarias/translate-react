import Bun from "bun";

import type { BunFile } from "bun";

import { ErrorHandler, ErrorSeverity } from "@/errors";
import Runner from "@/services/runner/runner.service";
import { logger } from "@/utils/logger.util";

import { name, version } from "../package.json";

import { env } from "./utils";

if (import.meta.main) {
	try {
		const logFile = Bun.file(`logs/${new Date().toISOString()}.log.jsonl`);
		if (!logFile) throw new Error("Failed to create log file");

		const errorHandler = initializeErrorHandler(logFile);
		logger.updateLogFilePath(logFile.name!);

		const runTranslation = errorHandler.wrapAsync(workflow, {
			operation: "main",
			metadata: { version, component: name, environment: env.NODE_ENV },
		});

		await runTranslation();

		process.exit(0);
	} catch {
		process.exit(1);
	}
}

async function workflow() {
	const runner = new Runner();

	await runner.run();
}

/**
 * Initializes the error handler with the default configuration.
 *
 * @param logFile Optional log file to write errors to
 *
 * @returns The configured ErrorHandler singleton instance
 */
function initializeErrorHandler(logFile?: BunFile): ErrorHandler {
	return ErrorHandler.getInstance({
		minSeverity: ErrorSeverity.Info,
		logToFile: !!logFile,
		logFilePath: logFile?.name,
		customReporter: (error) => {
			if (error.context.sanity === ErrorSeverity.Fatal) {
				process.exit(1);
			}
		},
	});
}
