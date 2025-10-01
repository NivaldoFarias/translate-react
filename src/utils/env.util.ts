import { z } from "zod";

import { ENV_DEFAULTS, RuntimeEnvironment } from "./constants.util";

/** Environment configuration schema for runtime validation */
const envSchema = z.object({
	NODE_ENV: z.enum(Object.values(RuntimeEnvironment)).default(ENV_DEFAULTS.NODE_ENV),
	BUN_ENV: z.enum(Object.values(RuntimeEnvironment)).default(ENV_DEFAULTS.BUN_ENV),

	/** The GitHub Personal Access Token */
	GITHUB_TOKEN: z.string().min(1),

	/** The owner (user or organization) of the forked repository */
	REPO_FORK_OWNER: z.string().min(1).default(ENV_DEFAULTS.REPO_FORK_OWNER),

	/** The name of the forked repository */
	REPO_FORK_NAME: z.string().min(1).default(ENV_DEFAULTS.REPO_FORK_NAME),

	/** Original repository owner */
	REPO_UPSTREAM_OWNER: z.string().min(1).default(ENV_DEFAULTS.REPO_UPSTREAM_OWNER),

	/** Original repository name */
	REPO_UPSTREAM_NAME: z.string().min(1).default(ENV_DEFAULTS.REPO_UPSTREAM_NAME),

	/** The LLM model to use */
	LLM_MODEL: z.string().min(1).default(ENV_DEFAULTS.LLM_MODEL),

	/** The OpenAI API key */
	OPENAI_API_KEY: z.string().min(1),

	/** The OpenAI API base URL. Defaults to OpenAI API */
	OPENAI_BASE_URL: z.url().default(ENV_DEFAULTS.OPENAI_BASE_URL),

	/** The OpenAI project ID. Used for activity tracking on OpenAI. */
	OPENAI_PROJECT_ID: z.string().optional(),

	/** The issue number of the progress tracking issue */
	PROGRESS_ISSUE_NUMBER: z.coerce.number().positive().default(ENV_DEFAULTS.PROGRESS_ISSUE_NUMBER),

	/** Whether to clear the snapshot on startup. Used for development. */
	FORCE_SNAPSHOT_CLEAR: z.coerce.boolean().default(ENV_DEFAULTS.FORCE_SNAPSHOT_CLEAR),

	/** The URL of the application. Used for activity tracking on Open Router. */
	HEADER_APP_URL: z.url().default(ENV_DEFAULTS.HEADER_APP_URL),

	/** The title of the application. Used for activity tracking on Open Router. */
	HEADER_APP_TITLE: z.string().default(ENV_DEFAULTS.HEADER_APP_TITLE),
});

/** Type definition for the environment configuration */
export type Environment = z.infer<typeof envSchema>;

/**
 * Validates all environment variables against the defined schema.
 *
 * Performs runtime checks to ensure all required variables are present and correctly typed.
 *
 * ## Workflow
 * 1. Parses environment variables using Zod schema
 * 2. Updates `import.meta.env` with validated values
 * 3. Throws detailed error messages for invalid configurations
 *
 * @throws {Error} Detailed validation errors if environment variables are invalid
 */
export function validateEnv() {
	try {
		const env = envSchema.parse(import.meta.env);

		Object.assign(import.meta.env, env);

		return env;
	} catch (error) {
		if (error instanceof z.ZodError) {
			const issues = error.issues
				.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
				.join("\n");
			throw new Error(`❌ Invalid environment variables:\n${issues}`);
		}

		throw error;
	}
}
