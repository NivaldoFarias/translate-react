import { z } from "zod";

import type { RunnerOptions } from "@/services/runner/base.service";

import { ValidationError } from "@/errors";

/**
 * Parses and validates command line arguments for the translation runner
 *
 * @throws {ValidationError} If the arguments format is invalid or missing required values
 */
export function parseCommandLineArgs(
	expectedArgs: string[],
	argsSchema: z.ZodSchema,
): RunnerOptions {
	const commandLineArgs = process.argv.slice(2);

	try {
		const argValues = getArgValues(expectedArgs);

		return argsSchema.parse(argValuesToOptions(expectedArgs, argValues));
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

	/**
	 * Retrieves the values of the command line arguments.
	 *
	 * @param args The expected arguments
	 *
	 * @returns The values of the command line arguments
	 */
	function getArgValues(args: string[]) {
		return args.map((argName) => {
			const matchingArg = commandLineArgs.find((arg) => arg.startsWith(argName));

			return matchingArg?.split("=")[1];
		});
	}

	/**
	 * Converts argument names to camelCase properties.
	 *
	 * Such as:
	 * - `--target` -> `targetLanguage`
	 * - `--source` -> `sourceLanguage`
	 * - `--batch-size` -> `batchSize`
	 *
	 * @param expectedArgs The expected arguments
	 * @param argValues The values of the command line arguments
	 *
	 * @returns The values of the command line arguments
	 */
	function argValuesToOptions(expectedArgs: string[], argValues: (string | undefined)[]) {
		return Object.fromEntries(
			expectedArgs.map((arg, index) => {
				const propName = arg.replace(/^--/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());

				return [propName, argValues[index]];
			}),
		);
	}
}
