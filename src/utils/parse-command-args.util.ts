import type { RunnerOptions } from "@/services/runner/base.service";

/** Parse command line arguments */
export function parseCommandLineArgs(): RunnerOptions {
	const commandLineArgs = process.argv.slice(2);
	const sourceArg = commandLineArgs.find((arg) => arg.startsWith("--source="))?.split("=")[1];
	const targetArg = commandLineArgs.find((arg) => arg.startsWith("--target="))?.split("=")[1];

	if (
		(commandLineArgs.length > 0 && sourceArg?.includes("=") === false) ||
		targetArg?.includes("=") === false
	) {
		throw new Error("Invalid argument format. Use: --source=<lang> and/or --target=<lang>");
	}

	return {
		targetLanguage: targetArg ?? "pt-BR",
		sourceLanguage: sourceArg ?? "en",
	};
}
