export class TranslationError extends Error {
	constructor(
		message: string,
		public code?: string,
		public context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "TranslationError";
	}
}

export const ErrorCodes = {
	GITHUB_API_ERROR: "GITHUB_API_ERROR",
	CLAUDE_API_ERROR: "CLAUDE_API_ERROR",
	RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
	INVALID_CONTENT: "INVALID_CONTENT",
	TRANSLATION_FAILED: "TRANSLATION_FAILED",
	NO_FILES_FOUND: "NO_FILES_FOUND",
	FORMAT_VALIDATION_FAILED: "FORMAT_VALIDATION_FAILED",
} as const;
