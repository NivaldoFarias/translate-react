import type { BunFile } from "bun";

/** Represents the severity level of an error */
export enum ErrorSeverity {
	Debug = "DEBUG",
	Info = "INFO",
	Warn = "WARN",
	Error = "ERROR",
	Fatal = "FATAL",
	Log = "LOG",
}

/** Standardized error codes for the translation workflow */
export enum ErrorCode {
	// Github API Related
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

	// Process Related
	ApiError = "API_ERROR",
	TranslationFailed = "TRANSLATION_FAILED",
	NoFilesFound = "NO_FILES_FOUND",
	InitializationError = "INITIALIZATION_ERROR",
	ResourceLoadError = "RESOURCE_LOAD_ERROR",
	ValidationError = "VALIDATION_ERROR",
	UnknownError = "UNKNOWN_ERROR",
	MissingKey = "MISSING_KEY",
	UnsupportedLang = "UNSUPPORTED_LANG",
}

/** Base context interface for all translation errors */
export interface ErrorContext {
	sanity: ErrorSeverity;
	code: ErrorCode;
	operation?: string;
	file?: BunFile | string;
	metadata?: Record<string, unknown>;
	timestamp?: Date;
}

export interface FormattedError extends Record<string, unknown> {
	name: string;
	message: string;
	code: ErrorCode;
	timestamp: string;
	context: ErrorContext;
	stack: string[];
}

/**
 * Base error class for all translation-related errors
 *
 * Extends the native Error class with additional context and tracking capabilities
 */
export class TranslationError extends Error {
	/** Standardized error code */
	public readonly code: ErrorCode;

	/** Timestamp when the error was created */
	public readonly timestamp: Date;

	/** Additional context about the error */
	public readonly context: ErrorContext;

	/**
	 * Initializes a new instance of the `TranslationError` class.
	 *
	 * Uses {@link Object.setPrototypeOf} to maintain proper prototype chain for custom errors.
	 */
	constructor(
		message: string,
		code: ErrorCode = ErrorCode.UnknownError,
		context: Partial<ErrorContext> = {},
	) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.timestamp = context.timestamp ?? new Date();
		this.context = {
			sanity: context.sanity ?? ErrorSeverity.Error,
			code: this.code,
			operation: context.operation,
			file: context.file,
			metadata: context.metadata,
			timestamp: this.timestamp,
		};

		Object.setPrototypeOf(this, new.target.prototype);
	}

	/** Creates a formatted error message including context information */
	public toJSON(): FormattedError {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			timestamp: this.timestamp.toISOString(),
			context: this.context,
			stack: this.stackList(this.stack),
		};
	}

	/**
	 * Converts the stack trace string into a list of lines for easier reading.
	 * Filters out error handler wrapper frames to show only relevant application code.
	 */
	private stackList(stack = ""): Array<string> {
		const stackLines = stack
			.split("\n")
			.slice(1) // Remove the error message line
			.map((line) => line.trim())
			.filter(Boolean); // Remove empty lines

		// Filter out error handling infrastructure frames
		const errorHandlerPatterns = [
			/proxy\.handler\.ts/,
			/error\.handler\.ts/,
			/wrapAsync/,
			/wrapSync/,
			/handleError/,
		];

		let filteredStack = stackLines.filter(
			(line) => !errorHandlerPatterns.some((pattern) => pattern.test(line)),
		);

		// Keep at least the first 3 lines if filtering removed everything
		if (filteredStack.length === 0) {
			filteredStack = stackLines.slice(0, 3);
		}

		return filteredStack;
	}

	/** Extracts a human-readable message from the error */
	public getDisplayMessage(): string {
		const context = this.context.operation ? ` (in ${this.context.operation})` : "";

		return `${this.message}${context}`;
	}
}

/**
 * Extracts a human-readable error message from various error types
 *
 * ### Handling
 *
 * - {@link TranslateError}: Uses the formatted message with context
 * - {@link Error}: Uses the native error message
 * - Other types: Converts to string
 *
 * @param error The error to extract a message from
 */
export function extractErrorMessage(error: unknown): string {
	if (error instanceof TranslationError) return error.getDisplayMessage();
	else if (error instanceof Error) return error.message;

	return String(error);
}
