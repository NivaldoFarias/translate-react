import { z } from "zod";

import type { RunnerOptions } from "@/services/runner/base.service";

/**
 * Schema for validating command line arguments
 * Defines the expected structure and types for the runner options
 */
const runnerOptionsSchema = z.object({
	targetLanguage: z.string().default("pt"),
	sourceLanguage: z.string().default("en"),
});

/** Parse command line arguments */
export function parseCommandLineArgs(): RunnerOptions {
	const commandLineArgs = process.argv.slice(2);

	try {
		const sourceArg = commandLineArgs.find((arg) => arg.startsWith("--source="))?.split("=")[1];
		const targetArg = commandLineArgs.find((arg) => arg.startsWith("--target="))?.split("=")[1];

		if (
			(commandLineArgs.length > 0 && sourceArg?.includes("=") === false) ||
			targetArg?.includes("=") === false
		) {
			throw new Error("Invalid argument format. Use: --source=<lang> and/or --target=<lang>");
		}

		return runnerOptionsSchema.parse({ targetLanguage: targetArg, sourceLanguage: sourceArg });
	} catch (error) {
		if (error instanceof z.ZodError) {
			const messages = error.errors.map(({ message }) => message).join(", ");

			throw new Error(`Invalid arguments: ${messages}`);
		}

		throw error;
	}
}
