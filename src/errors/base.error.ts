import { type BunFile } from "bun";

/** Represents the severity level of an error */
export enum ErrorSeverity {
	DEBUG = "DEBUG",
	INFO = "INFO",
	WARN = "WARN",
	ERROR = "ERROR",
	FATAL = "FATAL",
}

/**
 * Standardized error codes for the translation workflow
 */
export enum ErrorCode {
	// API Related
	GITHUB_API_ERROR = "GITHUB_API_ERROR",
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

/**
 * Base error class for all translation-related errors
 * Extends the native Error class with additional context and tracking capabilities
 */
export class TranslateError extends Error {
	public readonly code: ErrorCode;
	public readonly timestamp: Date;
	public readonly context: ErrorContext;

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

		// Ensure proper prototype chain for instanceof checks
		Object.setPrototypeOf(this, new.target.prototype);
	}

	/**
	 * Creates a formatted error message including context information
	 */
	public toJSON() {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			timestamp: this.timestamp.toISOString(),
			context: this.context,
			stack: this.stackList(this.stack),
		};
	}

	private stackList(stack = "") {
		return stack
			.split("\n")
			.slice(1)
			.map((line) => line.trim());
	}

	/**
	 * Extracts a human-readable message from the error
	 */
	public getDisplayMessage(): string {
		const context = this.context.operation ? ` (in ${this.context.operation})` : "";
		return `${this.message}${context}`;
	}
}
