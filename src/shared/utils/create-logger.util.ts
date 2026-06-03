import pino from "pino";

import { MAX_LOG_STRING_LENGTH } from "@/shared/constants/logging.constants";

import { nftsCompatibleDateString } from "./nfts-date.util";

/** Configuration for {@link createLogger} */
export interface CreateLoggerOptions {
	level: pino.LevelWithSilent;
	logToConsole: boolean;
	cwd?: string;
}

/**
 * Truncates large string values to reduce log verbosity.
 *
 * @param value Value to serialize
 * @param fieldName Field name for the truncation summary
 * @param maxLength Maximum length before truncation
 *
 * @returns Truncated string or original value if not a string or too short
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
 * Builds a Pino logger with file transport and optional pretty console output.
 *
 * @param options Log level, console toggle, and working directory for log files
 *
 * @returns Configured Pino logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger({ level: "info", logToConsole: true });
 * logger.info("ready");
 * ```
 */
export function createLogger(options: CreateLoggerOptions) {
	const cwd = options.cwd ?? process.cwd();

	return pino({
		level: options.level,
		base: {
			pid: process.pid,
			hostname: undefined,
		},
		timestamp: pino.stdTimeFunctions.isoTime,
		serializers: {
			error: pino.stdSerializers.err,
			content: (value: unknown) => truncateString(value, "content", MAX_LOG_STRING_LENGTH),
			body: (value: unknown) => truncateString(value, "body", MAX_LOG_STRING_LENGTH),
			text: (value: unknown) => truncateString(value, "text", MAX_LOG_STRING_LENGTH),
		},
		transport: {
			targets: [
				{
					target: "pino/file",
					level: "debug",
					options: {
						destination: `${cwd}/logs/${nftsCompatibleDateString()}.pino.log`,
						mkdir: true,
					},
				},
				...(options.logToConsole ?
					[
						{
							target: "pino-pretty",
							level: options.level,
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
}
