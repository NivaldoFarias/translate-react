import { processSignals } from "./constants.util";

export function setupSignalHandlers(cleanUpFn: (...args: unknown[]) => void | Promise<void>): void {
	for (const signal of Object.values(processSignals)) {
		process.on(signal, (...args: unknown[]) => {
			(async () => {
				try {
					await cleanUpFn(...args);
				} catch (error) {
					console.error(`Cleanup failed for signal ${signal}:`, error);
				}
			})();
		});
	}
}
