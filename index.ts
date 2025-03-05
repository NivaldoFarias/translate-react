import type { RunnerOptions } from "@/services/runner.service";

import Runner from "@/runner";

if (import.meta.main) {
	void new Runner(parseCommandLineArgs()).run();

	function parseCommandLineArgs(): RunnerOptions {
		const commandLineArgs = process.argv.slice(2);
		const sourceArg = commandLineArgs.find((arg) => arg.startsWith("--source="))?.split("=")[1];
		const targetArg = commandLineArgs.find((arg) => arg.startsWith("--target="))?.split("=")[1];

		if (
			(commandLineArgs.length > 0 && sourceArg?.includes("=") === false) ||
			targetArg?.includes("=") === false
		) {
			console.error("Invalid argument format. Use: --source=<lang> and/or --target=<lang>");
			process.exit(1);
		}

		return {
			targetLanguage: targetArg ?? "pt-BR",
			sourceLanguage: sourceArg ?? "en",
		};
	}
}
