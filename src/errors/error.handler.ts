/* eslint-disable no-console */
import Bun from "bun";

import type { ErrorContext } from "./base.error";

import type { LogEntry } from "@/utils";

import { ErrorCode, ErrorSeverity, TranslationError } from "./base.error";

/** Configuration options for the error handler */
export interface ErrorHandlerConfig {
	/** The minimum severity level to log */
	minSeverity?: ErrorSeverity;

	/** Whether to log errors to a file */
	logToFile?: boolean;

	/**
	 * The path to the log file (recommend using .jsonl extension for JSONL format)
	 *
	 * The ErrorHandler uses JSONL (JSON Lines) format where each line is a separate
	 * JSON object. This format is optimal for streaming logs and append-only operations.
	 */
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

/**
 * Centralized error handling service implementing the singleton pattern.
 *
 * Uses JSONL (JSON Lines) format for log files where each line contains a complete
 * JSON object. This format is optimal for streaming logs and append-only operations.
 * Recommended file extension: `.jsonl`
 */
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
			minSeverity: ErrorSeverity.Debug,
			logToFile: false,
			...config,
		};

		if (this.config.logToFile && this.config.logFilePath) {
			this.logFilePath = this.config.logFilePath;
			this.initializeLogFile();
		}
	}

	/**
	 * Initializes the log file with a startup entry
	 *
	 * Creates the log file immediately when ErrorHandler is instantiated to ensure
	 * proper observability from the beginning of the workflow execution.
	 */
	private initializeLogFile(): void {
		if (!this.logFilePath) return;

		const startupEntry = {
			timestamp: new Date().toISOString(),
			level: ErrorSeverity.Info,
			message: "ErrorHandler initialized - logging started",
			metadata: {
				logFilePath: this.logFilePath,
				minSeverity: this.config.minSeverity,
				process: {
					pid: process.pid,
					version: process.version,
				},
			},
		} satisfies LogEntry;

		const logLine = JSON.stringify(startupEntry) + "\n";

		/**
		 * Synchronous initialization to ensure log file exists before any errors occur
		 */
		try {
			Bun.write(this.logFilePath, logLine);
		} catch (initError) {
			console.error("Failed to initialize log file:", initError);
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

		this.logError(translatedError, translatedError.context.sanity).catch((logError) => {
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

		return new TranslationError(originalError.message, ErrorCode.UnknownError, {
			sanity: ErrorSeverity.Error,
			...context,
			metadata: {
				originalError,
				...context?.metadata,
			},
		});
	}

	/**
	 * Logs an error to file if configured
	 *
	 * Uses JSONL (JSON Lines) format for proper append-only logging.
	 * Each line is a valid JSON object, making the file easily parseable.
	 *
	 * @param error The error to log
	 * @param severity The severity level
	 */
	private async logError(error: TranslationError, severity: ErrorSeverity): Promise<void> {
		if (this.config.customReporter) {
			this.config.customReporter(error);
		}

		if (this.shouldLog(severity) && this.logFilePath) {
			try {
				const logEntry = {
					timestamp: new Date().toISOString(),
					level: severity,
					message: error.message,
					metadata: error.toJSON(),
				} satisfies LogEntry;

				const logLine = JSON.stringify(logEntry) + "\n";

				/**
				 * Write log entry using direct file system operations to avoid
				 * circular dependency with Logger service
				 */
				const existingContent = await Bun.file(this.logFilePath)
					.text()
					.catch(() => "");
				await Bun.write(this.logFilePath, existingContent + logLine);
			} catch (writeError) {
				console.error("Failed to write error to log file:", writeError);
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
}
