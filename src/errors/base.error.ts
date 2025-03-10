import { type BunFile } from "bun";

/** Represents the severity level of an error */
export enum ErrorSeverity {
	DEBUG = "DEBUG",
	INFO = "INFO",
	WARN = "WARN",
	ERROR = "ERROR",
	FATAL = "FATAL",
}

export const ErrorCodes = {
	INITIALIZATION_ERROR: "INITIALIZATION_ERROR",
	MISSING_KEY: "MISSING_KEY",
	UNSUPPORTED_LANG: "UNSUPPORTED_LANG",
	RESOURCE_LOAD_ERROR: "RESOURCE_LOAD_ERROR",
	API_ERROR: "API_ERROR",
	VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

/** Base context interface for all translation errors */
export interface ErrorContext {
	/** The severity level of the error */
	severity: ErrorSeverity;

	/** The file that the error occurred in */
	file?: BunFile | string;

	/** The operation that the error occurred in */
	operation?: string;

	/** The metadata of the error */
	metadata?: Record<string, unknown>;
}

/**
 * Base error class for all translation-related errors
 * Extends the native Error class with additional context and tracking capabilities
 */
export class TranslateError extends Error {
	/** The code of the error */
	public readonly code: string;

	/** The timestamp of the error */
	public readonly timestamp: Date;

	/** The context of the error */
	public readonly context: ErrorContext;

	/**
	 * Creates a new TranslateError instance
	 *
	 * @param message The error message
	 * @param code The error code
	 * @param context The error context
	 */
	constructor(message: string, code: string, context: Partial<ErrorContext> = {}) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.timestamp = new Date();
		this.context = {
			severity: context.severity ?? ErrorSeverity.ERROR,
			file: context.file,
			operation: context.operation,
			metadata: context.metadata,
		};

		Object.setPrototypeOf(this, new.target.prototype);
	}

	/** Creates a formatted error message including context information */
	public toJSON() {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			timestamp: this.timestamp.toISOString(),
			context: this.context,
			stack: this.stack,
		};
	}
}
