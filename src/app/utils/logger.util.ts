import type { Logger } from "pino";

import { env } from "@/app/schemas/env.schema";
import { createLogger } from "@/shared/utils/create-logger.util";

/**
 * Main logger instance for the translation application.
 *
 * @see {@link createLogger} for transport and serializer configuration
 */
export const logger: Logger = createLogger({
	level: env.LOG_LEVEL,
	logToConsole: env.LOG_TO_CONSOLE,
});
