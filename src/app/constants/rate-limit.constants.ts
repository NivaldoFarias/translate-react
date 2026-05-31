/**
 * Common rate limit patterns from various providers.
 *
 * Used to detect rate limit errors in error messages. Includes:
 * - Standard phrases like "rate limit" and "too many requests"
 * - HTTP status code as string
 * - Provider-specific phrases like "free-models-per-" / `free-models-per-day` for OpenRouter
 * - General quota exceeded patterns
 * - "requests per" patterns indicating rate limits
 */
export const RATE_LIMIT_PATTERNS = [
	"rate limit",
	"429",
	"free-models-per-",
	"quota",
	"too many requests",
	"requests per",
] as const;
