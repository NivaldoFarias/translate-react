import Bun from "bun";

import type { BunFile } from "bun";

import { ErrorHandler, ErrorSeverity } from "@/errors";
import Runner from "@/services/runner/runner.service";

import { name, version } from "../package.json";

import { env } from "./utils";

if (import.meta.main) {
	const errorHandler = initializeErrorHandler(
		Bun.file(`logs/${new Date().toISOString()}.log.jsonl`),
	);

	const runTranslation = errorHandler.wrapAsync(workflow, {
		operation: "main",
		metadata: { version, component: name, environment: env.NODE_ENV },
	});

	try {
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
