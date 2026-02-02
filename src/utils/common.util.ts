import { StatusCodes } from "http-status-codes";

import type { RepositoryTreeItem, WorkflowStatistics } from "@/services/";

import { ApplicationError, ErrorCode } from "@/errors/";

import { processSignals } from "./constants.util";
import { env } from "./env.util";
import { logger as baseLogger } from "./logger.util";

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
	return date.toISOString().replace(/:/g, "-");
}

/**
 * Validates the success rate of the workflow against the minimum threshold.
 *
 * @throws {ApplicationError} with {@link ErrorCode.BelowMinimumSuccessRate} If the success rate is below the configured minimum
 *
 * @param statistics final workflow statistics used for validation
 *
 * @see {@link env.MIN_SUCCESS_RATE|`env.MIN_SUCCESS_RATE`} for the configured threshold
 */
export function validateSuccessRate(statistics: WorkflowStatistics) {
	const logger = baseLogger.child({ component: validateSuccessRate.name });

	logger.debug(
		{ successRate: statistics.successRate, minSuccessRate: env.MIN_SUCCESS_RATE },
		"Validating success rate against minimum threshold",
	);

	if (statistics.successRate < env.MIN_SUCCESS_RATE) {
		logger.debug("Success rate below minimum threshold");

		const successPercentage = (statistics.successRate * 100).toFixed(1);
		const thresholdPercentage = (env.MIN_SUCCESS_RATE * 100).toFixed(0);

		const metadata = {
			successRate: successPercentage,
			minSuccessRate: thresholdPercentage,
			successCount: statistics.successCount,
			failureCount: statistics.failureCount,
			totalCount: statistics.totalCount,
		};
		const errorMessage = `Success rate ${successPercentage}% below threshold ${thresholdPercentage}%`;

		logger.fatal(metadata, errorMessage);

		throw new ApplicationError(
			errorMessage,
			ErrorCode.BelowMinimumSuccessRate,
			validateSuccessRate.name,
			metadata,
		);
	}

	logger.debug("Success rate meets minimum threshold");
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
	const seconds = Math.floor(elapsedTime / 1000);

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
export function filterMarkdownFiles<T extends RepositoryTreeItem>(tree: T[]): T[] {
	return tree.filter((item) => {
		if (!item.path) return false;
		if (!item.path.endsWith(".md")) return false;
		if (!item.path.includes("/")) return false;
		if (!item.path.includes("src/")) return false;

		return true;
	});
}

/**
 * Extracts the title of a document from its content by matching the `title` frontmatter key.
 *
 * Supports both single and double quotes around the title value.
 *
 * @param content The content of the document
 *
 * @returns The title of the document, or `undefined` if not found
 *
 * @example
 * ```typescript
 * import { extractDocTitleFromContent } from "@/utils/";
 *
 * const title = extractDocTitleFromContent(`
 * ---
 * title: 'Hello'
 * ---
 * # Hello
 *
 * Welcome to React!
 * `);
 * console.log(title);
 * // 'Hello'
 * ```
 */
export function extractDocTitleFromContent(content: string): string | undefined {
	const CATCH_CONTENT_TITLE_REGEX = /---[\s\S]*?title:\s*['"](.+?)['"][\s\S]*?---/gs;

	const match = CATCH_CONTENT_TITLE_REGEX.exec(content);

	return match?.[1];
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
	/** Check HTTP status code first for most reliable detection */
	if (statusCode === StatusCodes.TOO_MANY_REQUESTS) {
		return true;
	}

	/**
	 * Common rate limit patterns from various providers. Includes:
	 * - Standard phrases like "rate limit" and "too many requests"
	 * - HTTP status code as string
	 * - Provider-specific phrases like "free-models-per-" for OpenRouter
	 * - General quota exceeded patterns
	 * - "requests per" patterns indicating rate limits
	 */
	const rateLimitPatterns = [
		"rate limit",
		"429",
		"free-models-per-",
		"quota",
		"too many requests",
		"requests per",
	];

	return rateLimitPatterns.some((pattern) => errorMessage.toLowerCase().includes(pattern));
}
