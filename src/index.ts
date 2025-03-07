import Runner from "@/services/runner/runner.service";
import { parseCommandLineArgs } from "@/utils/parse-command-args.util";

if (import.meta.main) {
	let exitCode = 0;

	try {
		void new Runner(parseCommandLineArgs()).run();
	} catch (error) {
		console.error(error);
		exitCode = 1;
	} finally {
		process.exit(exitCode);
	}
}
