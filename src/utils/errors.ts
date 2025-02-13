/**
 * Custom error class for handling translation-specific errors.
 * Extends the native Error class with additional context and error code support.
 *
 * ## Features
 * - Custom error name for better error handling
 * - Optional error code from ErrorCodes enum
 * - Additional context for debugging
 */
export class TranslationError extends Error {
	/**
	 * Creates a new translation error instance
	 *
	 * @param message - Human-readable error description
	 * @param code - Error code from the ErrorCodes enum
	 * @param context - Additional contextual information about the error
	 */
	constructor(
		message: string,
		public code?: string,
		public context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "TranslationError";
	}
}

/**
 * Standardized error codes for translation workflow errors.
 * Used to categorize and handle different types of errors consistently.
 *
 * ## Available Codes
 * - `GITHUB_API_ERROR`: Issues with GitHub API operations
 * - `OPENAI_API_ERROR`: Issues with OpenAI API operations
 * - `RATE_LIMIT_EXCEEDED`: API rate limits reached
 * - `INVALID_CONTENT`: Content validation failures
 * - `TRANSLATION_FAILED`: General translation process failures
 * - `NO_FILES_FOUND`: No files found for translation
 * - `FORMAT_VALIDATION_FAILED`: Content format validation issues
 */
export const ErrorCodes = {
	GITHUB_API_ERROR: "GITHUB_API_ERROR",
	OPENAI_API_ERROR: "OPENAI_API_ERROR",
	RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
	INVALID_CONTENT: "INVALID_CONTENT",
	TRANSLATION_FAILED: "TRANSLATION_FAILED",
	NO_FILES_FOUND: "NO_FILES_FOUND",
	FORMAT_VALIDATION_FAILED: "FORMAT_VALIDATION_FAILED",
} as const;
