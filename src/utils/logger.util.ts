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
	 * Path to the log file (recommend using .json extension for JSON array format)
	 *
	 * The Logger uses JSON array format where all log entries are stored in a
	 * single JSON array. This format enables easy parsing as valid JSON.
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
 * Uses JSON array format for log files where all entries are stored in a single
 * JSON array structure. This format provides valid JSON that can be easily parsed.
 * Recommended file extension: `.json`
 *
 * @example
 * ```typescript
 * import { logger } from "@/utils/logger.util";
 *
 * await logger.info("Translator service started", { service: "translator" });
 * ```
 */
export class Logger {
	private static instance: Logger;

	/** The configuration for the logger */
	private readonly config: LoggerConfig;

	/** Severity levels in order of importance */
	private readonly severityOrder: ErrorSeverity[] = [
		ErrorSeverity.DEBUG,
		ErrorSeverity.LOG,
		ErrorSeverity.INFO,
		ErrorSeverity.WARN,
		ErrorSeverity.ERROR,
		ErrorSeverity.FATAL,
	];

	/**
	 * Creates a new Logger instance.
	 *
	 * @param config The configuration for the logger
	 */
	private constructor(config: LoggerConfig = {}) {
		this.config = {
			logToConsole: true,
			logToFile: false,
			minConsoleLevel: ErrorSeverity.LOG,
			minFileLevel: ErrorSeverity.INFO,
			...config,
		};
	}

	/**
	 * Returns the singleton Logger instance.
	 *
	 * The `config` parameter is only applied the first time the singleton is
	 * created. Subsequent calls return the same instance.
	 *
	 * @param config Optional configuration to use when creating the instance
	 *
	 * @returns The singleton instance of Logger
	 *
	 * @example
	 * ```typescript
	 * import { Logger } from "@/utils/logger.util";
	 *
	 * const instance = Logger.getInstance({ logToFile: true, logFilePath: ".logs/app.log" });
	 * ```
	 */
	public static getInstance(config?: LoggerConfig): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger(config);
		}

		return Logger.instance;
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
		return this.log(ErrorSeverity.DEBUG, message, metadata);
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
		return this.log(ErrorSeverity.INFO, message, metadata);
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
		return this.log(ErrorSeverity.LOG, message, metadata);
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
		return this.log(ErrorSeverity.WARN, message, metadata);
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
		return this.log(ErrorSeverity.ERROR, message, metadata);
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
		return this.log(ErrorSeverity.FATAL, message, metadata);
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
			// eslint-disable-next-line no-console
			(console[method] as (...args: unknown[]) => void)(logMessage, entry.metadata);
		} else {
			// eslint-disable-next-line no-console
			(console[method] as (...args: unknown[]) => void)(logMessage);
		}
	}

	/**
	 * Logs to file in JSON format.
	 *
	 * This method maintains a proper JSON array structure by reading existing
	 * content, parsing it as an array, appending the new entry, and writing
	 * back the complete array. It intentionally swallows file errors and logs
	 * them to console to avoid crashing the host process.
	 *
	 * @param entry The structured log entry to persist
	 */
	private async logToFile(entry: LogEntry): Promise<void> {
		try {
			const file = Bun.file(this.config.logFilePath!);
			const fileExists = await file.exists();

			let existingLogs: LogEntry[] = [];
			if (fileExists) {
				try {
					const existingContent = await file.text();
					if (existingContent.trim()) {
						const parsed = JSON.parse(existingContent) as unknown;
						if (Array.isArray(parsed)) {
							existingLogs = parsed as LogEntry[];
						} else {
							existingLogs = [];
						}
					}
				} catch {
					existingLogs = [];
				}
			}

			existingLogs.push(entry);
			const jsonContent = JSON.stringify(existingLogs, null, 2);
			await Bun.write(this.config.logFilePath!, jsonContent, { createPath: true });
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
			[ErrorSeverity.DEBUG]: "table",
			[ErrorSeverity.LOG]: "table",
			[ErrorSeverity.INFO]: "table",
			[ErrorSeverity.WARN]: "warn",
			[ErrorSeverity.ERROR]: "error",
			[ErrorSeverity.FATAL]: "error",
		};

		return methodMap[level];
	}
}

/**
 * Default shared logger instance for convenience.
 *
 * Import this from other modules for a single application-wide logger.
 *
 * @example
 * ```typescript
 * import { logger } from "@/utils/logger.util";
 *
 * await logger.info("Service started");
 * ```
 */
export const logger = Logger.getInstance();
