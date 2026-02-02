import { Octokit } from "@octokit/rest";

import { logger as baseLogger, env } from "@/utils";

/** Octokit-specific logger for GitHub API debugging */
const logger = baseLogger.child({ component: "octokit" });

/** Pre-configured instance of {@link Octokit} for application-wide use */
export const octokit = new Octokit({
	auth: env.GH_TOKEN,
	request: { timeout: env.GH_REQUEST_TIMEOUT },
	log: {
		debug: (message: string) => {
			logger.debug(message);
		},
		info: (message: string) => {
			logger.info(message);
		},
		warn: (message: string) => {
			logger.warn(message);
		},
		error: (message: string) => {
			logger.error(message);
		},
	},
});
