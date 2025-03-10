import { z } from "zod";

import type { RunnerOptions } from "@/services/runner/base.service";

import { ValidationError } from "@/errors";

/**
 * Schema for validating command line arguments
 * Defines the expected structure and types for the runner options
 */
const runnerOptionsSchema = z.object({
	targetLanguage: z.string().min(2).max(5).default("pt"),
	sourceLanguage: z.string().min(2).max(5).default("en"),
	batchSize: z.coerce.number().positive().default(10),
});

/**
 * Parses and validates command line arguments for the translation runner
 *
 * @throws {ValidationError} If the arguments format is invalid or missing required values
 */
export function parseCommandLineArgs(): RunnerOptions {
	const commandLineArgs = process.argv.slice(2);

	try {
		const [targetLanguage, sourceLanguage, batchSize] = getArgValues([
			"--target",
			"--source",
			"--batch-size",
		]);

		return runnerOptionsSchema.parse({ targetLanguage, sourceLanguage, batchSize });

		function getArgValues(args: string[]) {
			return args.map((argName) => {
				const matchingArg = commandLineArgs.find((arg) => arg.startsWith(argName));

				return matchingArg?.split("=")[1];
			});
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			const messages = error.errors.map(({ message }) => message).join(", ");

			throw new ValidationError(`Invalid arguments: ${messages}`, {
				operation: "parseCommandLineArgs",
				metadata: {
					zodErrors: error.errors,
					args: commandLineArgs,
				},
			});
		}

		if (error instanceof ValidationError) throw error;

		throw new ValidationError("Failed to parse command line arguments", {
			operation: "parseCommandLineArgs",
			metadata: { originalError: error, args: commandLineArgs },
		});
	}
}
