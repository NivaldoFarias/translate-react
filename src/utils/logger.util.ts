import pino from "pino";

import { nftsCompatibleDateString } from "./common.util";
import { MAX_LOG_STRING_LENGTH, RuntimeEnvironment } from "./constants.util";
import { env } from "./env.util";

/**
 * Truncates large string values to reduce log verbosity.
 *
 * @param value The value to serialize (string or other type)
 * @param fieldName The name of the field being serialized (for context in truncated message)
 * @param maxLength Maximum length before truncation (defaults to {@link MAX_LOG_STRING_LENGTH})
 *
 * @returns Original value if not a string or within length limit, otherwise truncated string with summary
 */
function truncateString(
	value: unknown,
	fieldName: string,
	maxLength = MAX_LOG_STRING_LENGTH,
): unknown {
	if (typeof value !== "string") return value;

	if (value.length <= maxLength) return value;

	return `[${fieldName}: ${value.length} chars, truncated] ${value.slice(0, maxLength)}...`;
}

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
	level: env.LOG_LEVEL,
	base: {
		pid: process.pid,
		hostname: undefined,
	},

	/** Timestamp format - ISO 8601 */
	timestamp: pino.stdTimeFunctions.isoTime,

	/**
	 * Custom serializers for structured logging.
	 * Transforms values before logging to reduce verbosity and improve readability.
	 */
	serializers: {
		error: pino.stdSerializers.err,

		/**
		 * Suppresses large content strings to reduce log verbosity.
		 *
		 * @param value The value to serialize
		 *
		 * @returns Original value if not a string or within {@link MAX_LOG_STRING_LENGTH} characters, otherwise truncated string with summary
		 */
		content: (value: unknown) => truncateString(value, "content", MAX_LOG_STRING_LENGTH),

		/**
		 * Suppresses large body strings to reduce log verbosity.
		 *
		 * @param value The value to serialize
		 *
		 * @returns Original value if not a string or within {@link MAX_LOG_STRING_LENGTH} characters, otherwise truncated string with summary
		 */
		body: (value: unknown) => truncateString(value, "body", MAX_LOG_STRING_LENGTH),

		/**
		 * Suppresses large text strings to reduce log verbosity.
		 *
		 * @param value The value to serialize
		 *
		 * @returns Original value if not a string or within {@link MAX_LOG_STRING_LENGTH} characters, otherwise truncated string with summary
		 */
		text: (value: unknown) => truncateString(value, "text", MAX_LOG_STRING_LENGTH),
	},

	/**
	 * Transport configuration.
	 * Handles output to multiple destinations
	 */
	transport: {
		targets: [
			/**
			 * File transport - structured JSON logs
			 * Creates log files in logs/ directory with filesystem-safe timestamp
			 * Format: YYYY-MM-DDTHH-mm-ss-sssZ (colons replaced with hyphens for NTFS compatibility)
			 */
			{
				target: "pino/file",
				level: "debug",
				options: {
					destination: `${process.cwd()}/logs/${nftsCompatibleDateString()}.pino.log`,
					mkdir: true,
				},
			},

			/**
			 * Console transport - pretty-printed for development
			 * Only active when `LOG_TO_CONSOLE` is enabled and not in production
			 */
			...(env.LOG_TO_CONSOLE && env.NODE_ENV !== RuntimeEnvironment.Production ?
				[
					{
						target: "pino-pretty",
						level: env.LOG_LEVEL,
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
