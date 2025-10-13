/* eslint-disable no-console */
import Bun from "bun";

import { ErrorSeverity } from "@/errors/base.error";

/**
 * Log entry structure for the agnostic logger.
 *
 * Contains the canonical fields produced by the logger when emitting a
 * single event. Consumers (file parsers, remote shipper, tests) can rely on
 * this shape.
 */
export interface LogEntry {
	/** The timestamp when the log entry was created */
	timestamp: string;

	/** The severity level of the log entry */
	level: ErrorSeverity;

	/** The main log message */
	message: string;

	/** Optional additional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Configuration for the logger service.
 *
 * Use this object to tune console/file output and minimum severity per
 * destination.
 */
export interface LoggerConfig {
	/** Whether to log to console */
	logToConsole?: boolean;

	/** Whether to log to file */
	logToFile?: boolean;

	/**
	 * Path to the log file (recommend using .jsonl extension for JSONL format)
	 *
	 * The Logger uses JSONL (JSON Lines) format where each line is a separate
	 * JSON object. This format is optimal for streaming logs and append-only operations.
	 */
	logFilePath?: string;

	/** Minimum severity to log to console */
	minConsoleLevel?: ErrorSeverity;

	/** Minimum severity to log to file */
	minFileLevel?: ErrorSeverity;
}

/**
 * Singleton logger service that can write structured log entries to both
 * console and a log file.
 *
 * The Logger centralizes message formatting and destination filtering so that
 * other services in the app can simply call the convenience methods
 * (`info`, `error`, etc.). It uses the {@link ErrorSeverity} enum to control
 * filtering behavior.
 *
 * Uses JSONL (JSON Lines) format for log files where each line contains a complete
 * JSON object. This format is optimal for streaming logs and append-only operations.
 * Recommended file extension: `.jsonl`
 *
 * @example
 * ```typescript
 * import { logger } from "@/utils/logger.util";
 *
 * await logger().info("Translator service started", { service: "translator" });
 * ```
 */
export class Logger {
	/** The configuration for the logger */
	private readonly config: LoggerConfig;

	/** The path to the log file */
	public logFilePath?: string;

	/** Severity levels in order of importance */
	private readonly severityOrder: ErrorSeverity[] = [
		ErrorSeverity.Debug,
		ErrorSeverity.Log,
		ErrorSeverity.Info,
		ErrorSeverity.Warn,
		ErrorSeverity.Error,
		ErrorSeverity.Fatal,
	];

	/**
	 * Creates a new Logger instance.
	 *
	 * @param config The configuration for the logger
	 *
	 * @example
	 * ```typescript
	 * // In services or other modules (after Logger is initialized in index.ts):
	 * import { Logger } from "@/utils/logger.util";
	 *
	 * const log = new Logger();
	 * await log.info("Service started");
	 * ```
	 */
	constructor(config: LoggerConfig = {}) {
		this.config = {
			logToConsole: true,
			logToFile: false,
			minConsoleLevel: ErrorSeverity.Log,
			minFileLevel: ErrorSeverity.Info,
			...config,
		};

		if (this.config.logToFile && this.config.logFilePath) {
			this.updateLogFilePath(this.config.logFilePath);
		}
	}

	public updateLogFilePath(newPath: string): void {
		this.logFilePath = newPath;
		this.config.logToFile = true;
		this.initializeLogFile();
	}

	/**
	 * Initializes the log file with a startup entry.
	 *
	 * Creates the log file immediately when Logger is instantiated to ensure
	 * proper observability from the beginning of the workflow execution.
	 */
	private initializeLogFile(): void {
		if (!this.logFilePath) return;

		const startupEntry = {
			timestamp: new Date().toISOString(),
			level: ErrorSeverity.Info,
			message: "Logger initialized - logging started",
			metadata: {
				logFilePath: this.logFilePath,
				minConsoleLevel: this.config.minConsoleLevel,
				minFileLevel: this.config.minFileLevel,
				process: {
					pid: process.pid,
					version: process.version,
				},
			},
		} satisfies LogEntry;

		const logLine = JSON.stringify(startupEntry) + "\n";

		/**
		 * Synchronous initialization to ensure log file exists before any logs occur
		 */
		try {
			Bun.write(this.logFilePath, logLine);
		} catch (initError) {
			console.error("Failed to initialize log file:", initError);
		}
	}

	/**
	 * Logs a message with the specified severity level.
	 *
	 * This is the central method that builds the structured {@link LogEntry} and
	 * dispatches it to configured destinations _(console and/or file)_.
	 *
	 * @param level The severity level for the message
	 * @param message The log message
	 * @param metadata Optional additional metadata to include with the entry
	 *
	 * @returns A `Promise` that resolves when the logger has attempted writing
	 * to all configured destinations
	 *
	 * @example
	 * ```typescript
	 * import { Logger } from "@/utils/logger.util";
	 *
	 * const logger = Logger.getInstance();
	 * await logger.log(ErrorSeverity.INFO, "Snapshot created", { id: "abc-123" });
	 * ```
	 */
	public async log(
		level: ErrorSeverity,
		message: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			metadata,
		};

		const promises: Promise<void>[] = [];

		if (this.config.logToConsole && this.shouldLogToConsole(level)) {
			promises.push(this.logToConsole(entry));
		}

		if (this.config.logToFile && this.config.logFilePath && this.shouldLogToFile(level)) {
			promises.push(this.logToFile(entry));
		}

		await Promise.allSettled(promises);
	}

	/**
	 * Logs a debug message.
	 *
	 * @param message The debug message
	 * @param metadata Optional metadata for context
	 *
	 * @returns A `Promise` that resolves when logging is complete
	 *
	 * @example
	 * ```typescript
	 * await logger.debug("Cache miss", { key: "user:1" });
	 * ```
	 */
	public async debug(message: string, metadata?: Record<string, unknown>): Promise<void> {
		return this.log(ErrorSeverity.Debug, message, metadata);
	}

	/**
	 * Logs an info message.
	 *
	 * @param message The info message
	 * @param metadata Optional metadata for context
	 *
	 * @returns A `Promise` that resolves when logging is complete
	 *
	 * @example
	 * ```typescript
	 * await logger.info("Connected to GitHub API", { rateLimit: 5000 });
	 * ```
	 */
	public async info(message: string, metadata?: Record<string, unknown>): Promise<void> {
		return this.log(ErrorSeverity.Info, message, metadata);
	}

	/**
	 * Logs a general message.
	 *
	 * @param message The message to log
	 * @param metadata Optional metadata for context
	 *
	 * @returns A `Promise` that resolves when logging is complete
	 *
	 * @example
	 * ```typescript
	 * await logger.message("Processing snapshot batch", { batchSize: 10 });
	 * ```
	 */
	public async message(message: string, metadata?: Record<string, unknown>): Promise<void> {
		return this.log(ErrorSeverity.Log, message, metadata);
	}

	/**
	 * Logs a warning message.
	 *
	 * @param message The warning message
	 * @param metadata Optional metadata for context
	 *
	 * @returns A `Promise` that resolves when logging is complete
	 *
	 * @example
	 * ```typescript
	 * await logger.warn("Deprecated API used", { endpoint: "/v1/old" });
	 * ```
	 */
	public async warn(message: string, metadata?: Record<string, unknown>): Promise<void> {
		return this.log(ErrorSeverity.Warn, message, metadata);
	}

	/**
	 * Logs an error message.
	 *
	 * @param message The error message
	 * @param metadata Optional metadata for context
	 *
	 * @returns A `Promise` that resolves when logging is complete
	 *
	 * @example
	 * ```typescript
	 * await logger.error("Failed to persist snapshot", { id: "abc-123", reason: err.message });
	 * ```
	 */
	public async error(message: string, metadata?: Record<string, unknown>): Promise<void> {
		return this.log(ErrorSeverity.Error, message, metadata);
	}

	/**
	 * Logs a fatal message.
	 *
	 * @param message The fatal message
	 * @param metadata Optional metadata for context
	 *
	 * @returns A `Promise` that resolves when logging is complete
	 *
	 * @example
	 * ```typescript
	 * await logger.fatal("Unhandled exception - shutting down", { code: 1 });
	 * ```
	 */
	public async fatal(message: string, metadata?: Record<string, unknown>): Promise<void> {
		return this.log(ErrorSeverity.Fatal, message, metadata);
	}

	/**
	 * Determines if a message should be logged to console.
	 *
	 * @param level The message severity
	 *
	 * @returns True when the message meets the minConsoleLevel filter
	 */
	private shouldLogToConsole(level: ErrorSeverity): boolean {
		const minIndex = this.severityOrder.indexOf(this.config.minConsoleLevel!);
		const currentIndex = this.severityOrder.indexOf(level);

		return currentIndex >= minIndex;
	}

	/**
	 * Determines if a message should be logged to file.
	 *
	 * @param level The message severity
	 *
	 * @returns True when the message meets the minFileLevel filter
	 */
	private shouldLogToFile(level: ErrorSeverity): boolean {
		const minIndex = this.severityOrder.indexOf(this.config.minFileLevel!);
		const currentIndex = this.severityOrder.indexOf(level);

		return currentIndex >= minIndex;
	}

	/**
	 * Logs to console with appropriate method.
	 *
	 * @param entry The structured log entry to emit
	 */
	private async logToConsole(entry: LogEntry): Promise<void> {
		const method = this.getConsoleMethod(entry.level);
		const logMessage = `[${entry.timestamp}] ${entry.level}: ${entry.message}`;

		if (entry.metadata) {
			(console[method] as (...args: unknown[]) => void)(logMessage, entry.metadata);
		} else {
			(console[method] as (...args: unknown[]) => void)(logMessage);
		}
	}

	/**
	 * Logs to file in JSONL format.
	 *
	 * Uses JSONL (JSON Lines) format for proper append-only logging.
	 * Each line is a valid JSON object, making the file easily parseable.
	 * This method intentionally swallows file errors and logs them to console
	 * to avoid crashing the host process.
	 *
	 * @param entry The structured log entry to persist
	 */
	private async logToFile(entry: LogEntry): Promise<void> {
		if (!this.logFilePath) return;

		try {
			const logLine = JSON.stringify(entry) + "\n";

			/**
			 * Append-only write for efficient JSONL logging
			 */
			const existingContent = await Bun.file(this.logFilePath)
				.text()
				.catch(() => "");
			await Bun.write(this.logFilePath, existingContent + logLine);
		} catch (error) {
			console.error("Failed to write log entry to file:", error);
		}
	}

	/**
	 * Maps severity levels to console methods.
	 *
	 * @param level The severity to map
	 *
	 * @returns The console method name to use for the given severity
	 */
	private getConsoleMethod(level: ErrorSeverity): keyof Console {
		const methodMap: Record<ErrorSeverity, keyof Console> = {
			[ErrorSeverity.Debug]: "table",
			[ErrorSeverity.Log]: "table",
			[ErrorSeverity.Info]: "table",
			[ErrorSeverity.Warn]: "warn",
			[ErrorSeverity.Error]: "error",
			[ErrorSeverity.Fatal]: "error",
		};

		return methodMap[level];
	}
}

export const logger = new Logger({
	logToConsole: true,
	minConsoleLevel: ErrorSeverity.Info,
	minFileLevel: ErrorSeverity.Info,
});
