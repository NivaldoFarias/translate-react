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
		String(StatusCodes.TOO_MANY_REQUESTS),
		"free-models-per-",
		"quota",
		"too many requests",
		"requests per",
	];

	return rateLimitPatterns.some((pattern) => errorMessage.toLowerCase().includes(pattern));
}
