import type { BunFile } from "bun";

/** Represents the severity level of an error */
export enum ErrorSeverity {
	DEBUG = "DEBUG",
	INFO = "INFO",
	WARN = "WARN",
	ERROR = "ERROR",
	FATAL = "FATAL",
	LOG = "LOG",
}

/** Standardized error codes for the translation workflow */
export enum ErrorCode {
	// API Related
	GITHUB_API_ERROR = "GITHUB_API_ERROR",
	GITHUB_NOT_FOUND = "GITHUB_NOT_FOUND",
	GITHUB_UNAUTHORIZED = "GITHUB_UNAUTHORIZED",
	GITHUB_FORBIDDEN = "GITHUB_FORBIDDEN",
	GITHUB_RATE_LIMITED = "GITHUB_RATE_LIMITED",
	GITHUB_SERVER_ERROR = "GITHUB_SERVER_ERROR",
	LLM_API_ERROR = "LLM_API_ERROR",
	RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
	API_ERROR = "API_ERROR",

	// Content Related
	INVALID_CONTENT = "INVALID_CONTENT",
	CONTENT_TOO_LONG = "CONTENT_TOO_LONG",
	NO_CONTENT = "NO_CONTENT",
	FORMAT_VALIDATION_FAILED = "FORMAT_VALIDATION_FAILED",

	// Process Related
	TRANSLATION_FAILED = "TRANSLATION_FAILED",
	NO_FILES_FOUND = "NO_FILES_FOUND",
	INITIALIZATION_ERROR = "INITIALIZATION_ERROR",
	RESOURCE_LOAD_ERROR = "RESOURCE_LOAD_ERROR",
	VALIDATION_ERROR = "VALIDATION_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
	MISSING_KEY = "MISSING_KEY",
	UNSUPPORTED_LANG = "UNSUPPORTED_LANG",
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
	 * Uses `Object.setPrototypeOf` to maintain proper prototype chain for custom errors.
	 */
	constructor(
		message: string,
		code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
		context: Partial<ErrorContext> = {},
	) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.timestamp = context.timestamp ?? new Date();
		this.context = {
			sanity: context.sanity ?? ErrorSeverity.ERROR,
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
