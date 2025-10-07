import { processSignals } from "./constants.util";

export function setupSignalHandlers(cleanUpFn: (...args: any[]) => void): void {
	for (const signal of Object.values(processSignals)) {
		process.on(signal, cleanUpFn);
	}
}
