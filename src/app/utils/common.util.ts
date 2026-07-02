import { MS_PER_SECOND, processSignals } from "@/app/constants";

export * from "@/shared/utils/nfts-date.util";
export * from "./github-url.util";
export * from "./markdown-path.util";
export * from "./rate-limit-detect.util";

type ResolveStringTruthy<Value> = Value extends false | null | undefined | 0 | "" ? never : Value;

/**
 * Returns `whenTrue` when `value` is truthy, otherwise `whenFalse`.
 *
 * Pass a function for `whenTrue` to receive the narrowed `value` or to defer
 * building the string until the value is known to be truthy.
 *
 * @param value Truthy check for including `whenTrue`
 * @param whenTrue String to return, or a factory receiving the narrowed `value`
 * @param whenFalse Value when `value` is falsy (default empty string)
 *
 * @returns `whenTrue` or its result when `value` is truthy, else `whenFalse`
 *
 * @example
 * ```typescript
 * resolveString(hasRetries, `[^retries]: ${note}\n`);
 * resolveString(runContext, (ctx) => `[${ctx.runId}](${ctx.url})`);
 * resolveString(workflowRunLine, (line) => `${line}\n`);
 * ```
 */
export function resolveString<Value>(
	value: Value,
	whenTrue: string | ((resolved: ResolveStringTruthy<Value>) => string),
	whenFalse = "",
) {
	if (!value) {
		return whenFalse;
	}

	if (typeof whenTrue === "function") {
		return whenTrue(value as ResolveStringTruthy<Value>);
	}

	return whenTrue;
}

/**
 * Formats a time duration in milliseconds to a human-readable string.
 *
 * Uses the {@link Intl.NumberFormat} API with `style: "unit"` for proper
 * locale-independent duration formatting.
 *
 * @param elapsedTime The elapsed time in milliseconds
 * @param locale The locale to use for formatting (default: "en")
 *
 * @returns A formatted duration string (e.g., "5 seconds", "2 minutes", "1 hour")
 *
 * @example
 * ```typescript
 * formatElapsedTime(5000); // "5 seconds"
 * formatElapsedTime(120000); // "2 minutes"
 * formatElapsedTime(3600000, "pt-BR"); // "1 hora"
 * ```
 */
export function formatElapsedTime(
	elapsedTime: number,
	locale: Intl.LocalesArgument = "en",
): string {
	const seconds = Math.floor(elapsedTime / MS_PER_SECOND);

	const formatUnit = (value: number, unit: "second" | "minute" | "hour") =>
		new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);

	if (seconds < 60) {
		return formatUnit(seconds, "second");
	} else if (seconds < 3600) {
		return formatUnit(Math.floor(seconds / 60), "minute");
	} else {
		return formatUnit(Math.floor(seconds / 3600), "hour");
	}
}

/** Registry for cleanup functions to be executed on process termination */
const cleanupRegistry = new Set<(...args: unknown[]) => void | Promise<void>>();

/** Tracks whether signal handlers have been registered */
let signalHandlersRegistered = false;

/**
 * Registers a cleanup function to be executed on process termination.
 *
 * @param cleanUpFn The cleanup function to register
 */
export function registerCleanup(cleanUpFn: (...args: unknown[]) => void | Promise<void>): void {
	cleanupRegistry.add(cleanUpFn);
}

/**
 * Sets up process signal handlers with proper error management.
 *
 * Registers handlers once at application startup. All registered cleanup functions
 * will be executed when a termination signal is received.
 *
 * @param errorReporter Optional error reporter for cleanup failures
 */
export function setupSignalHandlers(
	errorReporter?: (message: string, error: unknown) => void,
): void {
	if (signalHandlersRegistered) {
		return;
	}

	signalHandlersRegistered = true;

	const executeCleanups = async (...args: unknown[]) => {
		for (const cleanUpFn of cleanupRegistry) {
			try {
				await cleanUpFn(...args);
			} catch (error) {
				if (errorReporter) {
					errorReporter("Cleanup failed:", error);
				}
			}
		}
	};

	for (const signal of Object.values(processSignals)) {
		process.on(signal, (...args: unknown[]) => {
			void executeCleanups(...args);
		});
	}
}
