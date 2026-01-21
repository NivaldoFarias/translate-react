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
 * @throws {ApplicationError} If the success rate is below the configured minimum
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
