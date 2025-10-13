/**
 * @fileoverview
 *
 * Pino-based logger configuration
 *
 * This logger will eventually replace the custom Logger class.
 * For now, it exists alongside the existing logging system for gradual migration.
 *
 * ### Features
 * - **Fast**: Asynchronous, optimized logging via Pino
 * - **Structured**: Native JSON output for machine parsing
 * - **Dual output**: Logs to both file (JSON) and console (pretty-printed)
 * - **Child loggers**: Easy context propagation
 * - **Error serialization**: Built-in error handling
 */

import pino from "pino";

import { LogLevel, RuntimeEnvironment } from "./constants.util";
import { env } from "./env.util";

/**
 * Determines the log level based on environment
 *
 * - Production: info and above
 * - Development: debug and above
 * - Can be overridden with LOG_LEVEL env var
 */
const logLevel =
	env.LOG_LEVEL ??
	(env.NODE_ENV === RuntimeEnvironment.Production ? LogLevel.Info : LogLevel.Debug);

/**
 * Main logger instance
 *
 * Configured with dual transports:
 * 1. File transport: Writes structured JSON to log files
 * 2. Console transport: Pretty-printed output for development
 *
 * @example
 * ```typescript
 * import { logger } from '@/utils/logger.util';
 *
 * // Simple logging
 * logger.info('Application started');
 * logger.error('Something went wrong');
 *
 * // With context
 * logger.info({ file: 'test.md', size: 1024 }, 'Processing file');
 *
 * // With error object
 * logger.error({ err: error, operation: 'translate' }, 'Translation failed');
 *
 * // Create child logger with context
 * const fileLogger = logger.child({ component: 'translator' });
 * fileLogger.debug('Starting translation');
 * ```
 */
export const logger = pino({
	level: logLevel,
	base: {
		pid: process.pid,
		hostname: undefined,
	},

	/** Timestamp format - ISO 8601 */
	timestamp: pino.stdTimeFunctions.isoTime,

	/**
	 * Custom error serialization.
	 * Extracts useful fields from Error objects
	 */
	serializers: {
		err: pino.stdSerializers.err,
	},

	/**
	 * Transport configuration.
	 * Handles output to multiple destinations
	 */
	transport: {
		targets: [
			/**
			 * File transport - structured JSON logs
			 * Creates log files in logs/ directory with ISO timestamp
			 */
			{
				target: "pino/file",
				level: "debug",
				options: {
					destination: `${process.cwd()}/logs/${new Date().toISOString()}.pino.log`,
					mkdir: true,
				},
			},

			/**
			 * Console transport - pretty-printed for development
			 * Only active in non-production environments
			 */
			...(env.NODE_ENV !== RuntimeEnvironment.Production ?
				[
					{
						target: "pino-pretty",
						level: logLevel,
						options: {
							colorize: true,
							translateTime: "HH:MM:ss.l",
							ignore: "pid,hostname",
							singleLine: false,
						},
					},
				]
			:	[]),
		],
	},
});
