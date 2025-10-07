import { StatusCodes } from "http-status-codes";

/**
 * Detects if an error message indicates a rate limit has been exceeded.
 *
 * Centralizes all rate limit detection patterns to ensure consistent behavior
 * across different error handlers and services.
 *
 * @param errorMessage The error message to analyze
 * @param statusCode Optional HTTP status code to check
 *
 * @returns `true` if the error indicates a rate limit has been exceeded
 *
 * @example
 * ```typescript
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

	/** Common rate limit patterns from various providers */
	const rateLimitPatterns = [
		"rate limit",
		"429", // HTTP status code as string
		"free-models-per-", // OpenRouter free tier limit
		"quota", // General quota exceeded patterns
		"too many requests", // Standard rate limit message
		"requests per", // "requests per minute/hour" patterns
	];

	return rateLimitPatterns.some((pattern) => errorMessage.toLowerCase().includes(pattern));
}
