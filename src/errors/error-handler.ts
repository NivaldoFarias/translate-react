import Bun from "bun";

import type { BunFile } from "bun";

import type { ErrorContext } from "./base.error";

import { ErrorSeverity, TranslateError } from "./base.error";

/* eslint-disable no-console */

/** Configuration options for the error handler */
export interface ErrorHandlerConfig {
	/** The minimum severity level to log */
	minSeverity?: ErrorSeverity;

	/** Whether to log errors to a file */
	logToFile?: boolean;

	/** The path to the log file */
	logFilePath?: string;

	/** A custom reporter function */
	customReporter?: (error: TranslateError) => void;
}

/** Centralized error handling service implementing the singleton pattern */
export class ErrorHandler {
	/** The singleton instance of ErrorHandler */
	private static instance: ErrorHandler;

	/** The configuration for the error handler */
	private readonly config: ErrorHandlerConfig;

	/** The stream to write errors to */
	private logStream?: BunFile;

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
			this.logStream = Bun.file(this.config.logFilePath);
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
		if (!ErrorHandler.instance) {
			ErrorHandler.instance = new ErrorHandler(config);
		}
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
	public handle(error: Error, context?: Partial<ErrorContext>) {
		const translatedError = this.wrapError(error, context);
		this.logError(translatedError);

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
	private wrapError(error: Error, context?: Partial<ErrorContext>): TranslateError {
		if (error instanceof TranslateError) return error;

		return new TranslateError(error.message, "UNKNOWN_ERROR", {
			severity: ErrorSeverity.ERROR,
			...context,
			metadata: {
				originalError: error,
				...context?.metadata,
			},
		});
	}

	/**
	 * Logs an error based on configuration
	 *
	 * @param error The error to log
	 */
	private logError(error: TranslateError) {
		const severity = error.context.severity ?? ErrorSeverity.ERROR;
		if (this.shouldLog(severity)) {
			const logMessage = JSON.stringify(error.toJSON(), null, 2);
			const method = this.getSeverityMethod(severity);

			// Use type assertion to handle dynamic console method call
			(console[method] as (...args: any[]) => void)(logMessage);

			if (this.logStream) {
				this.logStream.write(logMessage + "\n");
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
		};
		return methodMap[severity];
	}
}
