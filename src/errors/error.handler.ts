import Bun from "bun";

import type { ErrorContext } from "./base.error";

import { ErrorCode, ErrorSeverity, TranslationError } from "./base.error";

/** Configuration options for the error handler */
export interface ErrorHandlerConfig {
	/** The minimum severity level to log */
	minSeverity?: ErrorSeverity;

	/** Whether to log errors to a file */
	logToFile?: boolean;

	/** The path to the log file */
	logFilePath?: string;

	/** A custom reporter function */
	customReporter?: (error: TranslationError) => void;
}

/**
 * Extracts a human-readable error message from various error types
 *
 * ### Handling
 * - TranslateError: Uses the formatted message with context
 * - Error: Uses the native error message
 * - Other types: Converts to string
 *
 * @param error The error to extract a message from
 */
export function extractErrorMessage(error: unknown): string {
	if (error instanceof TranslationError) return error.getDisplayMessage();
	else if (error instanceof Error) return error.message;

	return String(error);
}

/** Centralized error handling service implementing the singleton pattern */
export class ErrorHandler {
	/** The singleton instance of ErrorHandler */
	private static instance: ErrorHandler;

	/** The configuration for the error handler */
	private readonly config: ErrorHandlerConfig;

	/** The path to the log file */
	private logFilePath?: string;

	/**
	 * Creates a new ErrorHandler instance
	 *
	 * @param config The configuration for the error handler
	 */
	private constructor(config: ErrorHandlerConfig = {}) {
		this.config = {
			minSeverity: ErrorSeverity.DEBUG,
			logToFile: false,
			...config,
		};

		if (this.config.logToFile && this.config.logFilePath) {
			this.logFilePath = this.config.logFilePath;
		}
	}

	/**
	 * Gets the singleton instance of ErrorHandler
	 *
	 * @param config The configuration for the error handler
	 *
	 * @returns The singleton instance of ErrorHandler
	 */
	public static getInstance(config?: ErrorHandlerConfig): ErrorHandler {
		if (!ErrorHandler.instance) ErrorHandler.instance = new ErrorHandler(config);

		return ErrorHandler.instance;
	}

	/**
	 * Handles an error by logging it and optionally reporting it
	 *
	 * @param error The error to handle
	 * @param context The context for the error
	 *
	 * @returns The translated error
	 */
	public handle(error: Error, context?: Partial<ErrorContext>): TranslationError {
		const translatedError = this.wrapError(error, context);

		this.logError(translatedError).catch((logError) => {
			console.error("Failed to log error:", logError);
		});

		if (this.config.customReporter) {
			this.config.customReporter(translatedError);
		}

		return translatedError;
	}

	/**
	 * Wraps a function with error handling
	 *
	 * @param fn The function to wrap
	 * @param context The context for the error
	 *
	 * @returns The wrapped function
	 */
	public wrapAsync<T, Args extends any[]>(
		fn: (...args: Args) => Promise<T>,
		context?: Partial<ErrorContext>,
	) {
		return async (...args: Args): Promise<T> => {
			try {
				return await fn(...args);
			} catch (error) {
				throw this.handle(error as Error, {
					operation: fn.name,
					...context,
				});
			}
		};
	}

	/**
	 * Wraps a synchronous function with error handling
	 *
	 * @param fn The function to wrap
	 * @param context The context for the error
	 *
	 * @returns The wrapped function
	 */
	public wrapSync<T, Args extends any[]>(
		fn: (...args: Args) => T,
		context?: Partial<ErrorContext>,
	) {
		return (...args: Args): T => {
			try {
				return fn(...args);
			} catch (error) {
				throw this.handle(error as Error, {
					operation: fn.name,
					...context,
				});
			}
		};
	}

	/**
	 * Converts any error to a TranslateError
	 *
	 * @param error The error to convert
	 * @param context The context for the error
	 *
	 * @returns The translated error
	 */
	private wrapError(error: Error, context?: Partial<ErrorContext>): TranslationError {
		if (error instanceof TranslationError) return error;

		const originalError = error instanceof Error ? error : new Error(String(error));

		return new TranslationError(originalError.message, ErrorCode.UNKNOWN_ERROR, {
			sanity: ErrorSeverity.ERROR,
			...context,
			metadata: {
				originalError,
				...context?.metadata,
			},
		});
	}

	/**
	 * Logs an error based on configuration
	 *
	 * @param error The error to log
	 */
	private async logError(error: TranslationError): Promise<void> {
		const severity = error.context.sanity ?? ErrorSeverity.ERROR;

		if (this.shouldLog(severity)) {
			if (this.logFilePath) {
				try {
					const logEntry = JSON.stringify(error.toJSON(), null, 2) + "\n";
					const file = Bun.file(this.logFilePath);
					const existingContent = (await file.exists()) ? await file.text() : "";

					await Bun.write(this.logFilePath, existingContent + logEntry, { createPath: true });
				} catch (writeError) {
					console.error("Failed to write error to log file:", writeError);
				}
			}
		}
	}

	/**
	 * Determines if an error should be logged based on minimum severity
	 *
	 * @param severity The severity of the error
	 *
	 * @returns Whether the error should be logged
	 */
	private shouldLog(severity: ErrorSeverity): boolean {
		const severityLevels = Object.values(ErrorSeverity);
		const minIndex = severityLevels.indexOf(this.config.minSeverity!);
		const currentIndex = severityLevels.indexOf(severity);

		return currentIndex >= minIndex;
	}

	/**
	 * Maps severity levels to console methods
	 *
	 * @param severity The severity of the error
	 *
	 * @returns The console method to use
	 */
	private getSeverityMethod(severity: ErrorSeverity): keyof Console {
		const methodMap: Record<ErrorSeverity, keyof Console> = {
			[ErrorSeverity.DEBUG]: "debug",
			[ErrorSeverity.INFO]: "info",
			[ErrorSeverity.WARN]: "warn",
			[ErrorSeverity.ERROR]: "error",
			[ErrorSeverity.FATAL]: "error",
			[ErrorSeverity.LOG]: "log",
		};

		return methodMap[severity];
	}
}
