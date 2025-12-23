/** Standardized error codes for the translation workflow */
export enum ErrorCode {
	// GitHub API Related
	GithubApiError = "GITHUB_API_ERROR",
	GithubNotFound = "GITHUB_NOT_FOUND",
	GithubUnauthorized = "GITHUB_UNAUTHORIZED",
	GithubForbidden = "GITHUB_FORBIDDEN",
	GithubRateLimited = "GITHUB_RATE_LIMITED",
	GithubServerError = "GITHUB_SERVER_ERROR",

	// LLM API Related
	LLMApiError = "LLM_API_ERROR",

	// Generic HTTP Related
	RateLimitExceeded = "RATE_LIMIT_EXCEEDED",
	Unauthorized = "UNAUTHORIZED",
	Forbidden = "FORBIDDEN",
	NotFound = "NOT_FOUND",
	ServerError = "SERVER_ERROR",

	// Content Related
	InvalidContent = "INVALID_CONTENT",
	ContentTooLong = "CONTENT_TOO_LONG",
	NoContent = "NO_CONTENT",
	FormatValidationFailed = "FORMAT_VALIDATION_FAILED",
	ChunkProcessingFailed = "CHUNK_PROCESSING_FAILED",

	// Process Related
	ApiError = "API_ERROR",
	TranslationFailed = "TRANSLATION_FAILED",
	NoFilesFound = "NO_FILES_FOUND",
	InitializationError = "INITIALIZATION_ERROR",
	ResourceLoadError = "RESOURCE_LOAD_ERROR",
	ValidationError = "VALIDATION_ERROR",
	UnknownError = "UNKNOWN_ERROR",
}

/** Context for translation errors providing operation and debugging information */
export interface TranslationErrorContext<
	T extends Record<string, unknown> = Record<string, unknown>,
> {
	/** The operation that failed */
	operation: string;

	/** Additional metadata for debugging */
	metadata?: T;
}

/**
 * Base error class for all translation-related errors.
 *
 * Provides standardized error handling with error codes and optional context.
 */
export class TranslationError<
	T extends Record<string, unknown> = Record<string, unknown>,
> extends Error {
	/** Standardized error code */
	public readonly code: ErrorCode;

	/** Timestamp when the error was created */
	public readonly timestamp: Date;

	/** The operation that failed */
	public readonly operation: string;

	/** Additional metadata for debugging */
	public readonly metadata?: T;

	constructor(
		message: string,
		code: ErrorCode = ErrorCode.UnknownError,
		context: TranslationErrorContext<T> | undefined,
	) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.timestamp = new Date();
		this.operation = context?.operation ?? "UnknownOperation";
		this.metadata = context?.metadata;

		Object.setPrototypeOf(this, new.target.prototype);
	}

	/** Extracts a human-readable message from the error */
	public getDisplayMessage(): string {
		const operationSuffix = this.operation ? ` (in ${this.operation})` : "";

		return `${this.message}${operationSuffix}`;
	}
}

/**
 * Extracts a human-readable error message from various error types.
 *
 * @param error The error to extract a message from
 *
 * @returns Human-readable error message
 */
export function extractErrorMessage(error: unknown): string {
	if (error instanceof TranslationError) return error.getDisplayMessage();
	if (error instanceof Error) return error.message;

	return String(error);
}
