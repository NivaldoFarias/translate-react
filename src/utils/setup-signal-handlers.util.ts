import { processSignals } from "./constants.util";

/**
 * Sets up process signal handlers with proper error management.
 *
 * @param cleanUpFn The cleanup function to execute on signal reception
 * @param errorReporter Optional error reporter for cleanup failures (defaults to console.error)
 */
export function setupSignalHandlers(
	cleanUpFn: (...args: unknown[]) => void | Promise<void>,
	errorReporter?: (message: string, error: unknown) => void,
): void {
	const reportError =
		errorReporter ??
		((message: string, error: unknown) => {
			/**
			 * Fallback to console.error for signal cleanup failures when no custom
			 * error reporter is provided. This is acceptable for process shutdown scenarios
			 * where the logging system may not be available.
			 */
			console.error(message, error);
		});

	for (const signal of Object.values(processSignals)) {
		process.on(signal, (...args: unknown[]) => {
			(async () => {
				try {
					await cleanUpFn(...args);
				} catch (error) {
					reportError(`Cleanup failed for signal ${signal}:`, error);
				}
			})();
		});
	}
}
