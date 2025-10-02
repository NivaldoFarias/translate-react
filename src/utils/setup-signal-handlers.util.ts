import { PROCESS_SIGNALS } from "./constants.util";

export function setupSignalHandlers(cleanUpFn: (...args: any[]) => void): void {
	for (const signal of Object.values(PROCESS_SIGNALS)) {
		process.on(signal, cleanUpFn);
	}
}
