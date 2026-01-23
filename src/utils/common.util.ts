import type { WorkflowStatistics } from "@/services/";

import { ApplicationError, ErrorCode } from "@/errors/";

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
 * Uses the {@link Intl.RelativeTimeFormat} API for localization.
 *
 * @param elapsedTime The elapsed time in milliseconds
 * @param locale The locale to use for formatting (default: "en")
 *
 * @returns A formatted duration string
 */
export function formatElapsedTime(
	elapsedTime: number,
	locale: Intl.LocalesArgument = "en",
): string {
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "long" });

	const seconds = Math.floor(elapsedTime / 1000);

	if (seconds < 60) {
		return formatter.format(seconds, "second").replace("in ", "");
	} else if (seconds < 3600) {
		return formatter.format(Math.floor(seconds / 60), "minute").replace("in ", "");
	} else {
		return formatter.format(Math.floor(seconds / 3600), "hour").replace("in ", "");
	}
}
