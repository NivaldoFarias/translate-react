import { StatusCodes } from "http-status-codes";

import { RATE_LIMIT_PATTERNS } from "@/app/constants";

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
 * import { detectRateLimit } from "@/app/utils/";
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
