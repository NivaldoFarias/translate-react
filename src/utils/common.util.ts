import { StatusCodes } from "http-status-codes";

import type { RepositoryTreeItem } from "@/services/";

import { MS_PER_SECOND, processSignals, RATE_LIMIT_PATTERNS } from "./constants.util";

/**
 * Formats a {@link Date} object into an NFTS-compatible date string.
 *
 * NFTS date strings replace colons with hyphens to ensure compatibility
 * with file systems that restrict the use of colons in filenames.
 *
 * @param date Date object to format (defaults to current date/time)
 *
 * @returns NFTS-compatible date string in ISO format
 *
 * @example
 * ```typescript
 * import { nftsCompatibleDateString } from "@/utils/";
 *
 * const dateStr = nftsCompatibleDateString(new Date('2024-01-01T12:34:56Z'));
 * console.log(dateStr);
 * // '2024-01-01T12-34-56.000Z'
 * ```
 *
 * @see {@link https://en.wikipedia.org/wiki/ISO_8601#Representations_of_dates_and_times:~:text=Combined%20date%20and%20time%20representations|ISO 8601: Combined date and time representations}
 */
export function nftsCompatibleDateString(date = new Date()): string {
	return date.toISOString().replace(new RegExp(/:/g), "-");
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

/**
 * Filters repository tree for markdown files.
 *
 * @param tree Repository tree from GitHub API
 */
export function filterMarkdownFiles(tree: RepositoryTreeItem[]): RepositoryTreeItem[] {
	return tree.filter((item) => {
		if (!item.path) return false;
		if (!item.path.endsWith(".md")) return false;
		if (!item.path.includes("/")) return false;
		if (!item.path.includes("src/")) return false;

		return true;
	});
}

/**
 * Detects if an error message indicates a rate limit has been exceeded.
 *
 * @param errorMessage The error message to analyze
 * @param statusCode Optional HTTP status code to check
 *
 * @returns `true` if the error indicates a rate limit has been exceeded
 *
 * @example
 * ```typescript
 * import { detectRateLimit } from "@/utils/";
 *
 * const error = new Error("Rate limit exceeded");
 * const isRateLimit = detectRateLimit(error.message);
 * console.log(isRateLimit); // true
 *
 * const apiError = { message: "429 Too Many Requests", status: 429 };
 * const isRateLimit2 = detectRateLimit(apiError.message, apiError.status);
 * console.log(isRateLimit2); // true
 * ```
 */
export function detectRateLimit(errorMessage: string, statusCode?: number): boolean {
	if (statusCode === StatusCodes.TOO_MANY_REQUESTS) {
		return true;
	}

	return RATE_LIMIT_PATTERNS.some((pattern) => errorMessage.toLowerCase().includes(pattern));
}
