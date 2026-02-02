import { z } from "zod";

import {
	environmentDefaults,
	LogLevel,
	MIN_API_TOKEN_LENGTH,
	REACT_TRANSLATION_LANGUAGES,
	RuntimeEnvironment,
} from "./constants.util";

/**
 * Creates a secure token validation schema with common security checks.
 *
 * @param envName The name of the environment variable (for error messages)
 *
 * @returns A Zod schema that validates API tokens/keys
 */
function createTokenSchema(envName: string) {
	return z
		.string()
		.min(MIN_API_TOKEN_LENGTH, `${envName} looks too short; ensure your API key is set`)
		.refine((value) => !/\s/.test(value), `${envName} must not contain whitespace`)
		.refine(
			(value) =>
				!["CHANGE_ME", "dev-token", "dev-key", "your-token-here", "your-key-here"].includes(value),
			`${envName} appears to be a placeholder. Set a real token`,
		);
}

/** Detects if running in test environment */
function isTestEnvironment(): boolean {
	return import.meta.env.NODE_ENV === RuntimeEnvironment.Test;
}

/**
 * The resolves default environment values, based on the current {@link process.env.NODE_ENV}.
 *
 * If the environment variable is not set, the default is {@link RuntimeEnvironment.Development}.
 */
const envDefaults =
	environmentDefaults[
		(import.meta.env.NODE_ENV as RuntimeEnvironment | undefined) ?? RuntimeEnvironment.Development
	];

/** Environment configuration schema for runtime validation */
const envSchema = z.object({
	/** Node.js's runtime environment */
	NODE_ENV: z.enum(RuntimeEnvironment).default(envDefaults.NODE_ENV),

	/** Logging level for the application */
	LOG_LEVEL: z.enum(LogLevel).default(envDefaults.LOG_LEVEL),

	/** The GitHub Personal Access Token (optional in test environment) */
	GH_TOKEN:
		isTestEnvironment() ? createTokenSchema("GH_TOKEN").optional() : createTokenSchema("GH_TOKEN"),

	/**
	 * Optional GitHub Personal Access Token for fallback authentication.
	 *
	 * Used when the primary token (GitHub App bot) receives 403 errors due to
	 * insufficient permissions. The fallback client automatically retries with
	 * this PAT when configured.
	 */
	GH_PAT_TOKEN: createTokenSchema("GH_PAT_TOKEN").optional(),

	/** The OpenAI/OpenRouter/etc API key (optional in test environment) */
	LLM_API_KEY:
		isTestEnvironment() ?
			createTokenSchema("LLM_API_KEY").optional()
		:	createTokenSchema("LLM_API_KEY"),

	/** The forked repository's owner */
	REPO_FORK_OWNER: z.string().default(envDefaults.REPO_FORK_OWNER),

	/** The name of the forked repository */
	REPO_FORK_NAME: z.string().default(envDefaults.REPO_FORK_NAME),

	/** Original repository owner */
	REPO_UPSTREAM_OWNER: z.string().default(envDefaults.REPO_UPSTREAM_OWNER),

	/** Original repository name */
	REPO_UPSTREAM_NAME: z.string().default(envDefaults.REPO_UPSTREAM_NAME),

	/** The LLM model to use */
	LLM_MODEL: z.string().default(envDefaults.LLM_MODEL),

	/** The OpenAI/OpenRouter/etc API base URL */
	LLM_API_BASE_URL: z.url().default(envDefaults.LLM_API_BASE_URL),

	/** The OpenAI project's ID. Used for activity tracking on OpenAI. */
	OPENAI_PROJECT_ID: z.string().optional(),

	/**
	 * The URL of the application to override the default URL.
	 *
	 * Used for activity tracking on {@link https://openrouter.ai/|OpenRouter}.
	 */
	HEADER_APP_URL: z.url().default(envDefaults.HEADER_APP_URL),

	/**
	 * The title of the application to override the default title.
	 *
	 * Used for activity tracking on {@link https://openrouter.ai/|OpenRouter}.
	 */
	HEADER_APP_TITLE: z.string().default(envDefaults.HEADER_APP_TITLE),

	/** The number of items to process in each batch */
	BATCH_SIZE: z.coerce.number().positive().default(envDefaults.BATCH_SIZE),

	/**
	 * The target language for translation.
	 *
	 * Must be one of the 38 supported React translation languages.
	 *
	 * @see {@link REACT_TRANSLATION_LANGUAGES}
	 */
	TARGET_LANGUAGE: z.enum(REACT_TRANSLATION_LANGUAGES).default(envDefaults.TARGET_LANGUAGE),

	/**
	 * The source language for translation.
	 *
	 * Must be one of the 38 supported React translation languages.
	 *
	 * @see {@link REACT_TRANSLATION_LANGUAGES}
	 */
	SOURCE_LANGUAGE: z.enum(REACT_TRANSLATION_LANGUAGES).default(envDefaults.SOURCE_LANGUAGE),

	/** Maximum tokens to generate in a single LLM response */
	MAX_TOKENS: z.coerce.number().positive().default(envDefaults.MAX_TOKENS),

	/**
	 * Whether to enable console logging in addition to file logging.
	 *
	 * When `false`, logs are only written to files.
	 * Useful for reducing terminal clutter in debug mode while preserving detailed file logs.
	 */
	LOG_TO_CONSOLE: z.stringbool().default(envDefaults.LOG_TO_CONSOLE),

	/**
	 * Timeout for GitHub API requests in **milliseconds**.
	 *
	 * Prevents indefinite hangs on slow or stuck API calls. If a request exceeds this
	 * timeout, it will be aborted and throw an error.
	 */
	GH_REQUEST_TIMEOUT: z.coerce.number().positive().default(envDefaults.GH_REQUEST_TIMEOUT),

	/**
	 * Minimum success rate (0-1) required for workflow to pass.
	 *
	 * If the translation success rate falls below this threshold, the workflow
	 * will exit with a non-zero code. Set to 0 to disable failure detection.
	 */
	MIN_SUCCESS_RATE: z.coerce.number().min(0).max(1).default(envDefaults.MIN_SUCCESS_RATE),

	/** Maximum retry attempts for translation errors */
	MAX_RETRY_ATTEMPTS: z.coerce.number().positive().default(envDefaults.MAX_RETRY_ATTEMPTS),

	/** Concurrency limit for LLM requests */
	MAX_LLM_CONCURRENCY: z.coerce.number().positive().default(envDefaults.MAX_LLM_CONCURRENCY),

	/** Concurrency limit for GitHub operations */
	MAX_GITHUB_CONCURRENCY: z.coerce.number().positive().default(envDefaults.MAX_GITHUB_CONCURRENCY),
});

/** Type definition for the environment configuration */
export type Environment = z.infer<typeof envSchema>;

/**
 * Validates all environment variables against the defined schema.
 *
 * Performs runtime checks to ensure all required variables are present and correctly typed.
 *
 * ### Workflow
 * 1. Parses environment variables using Zod schema
 * 2. Updates `import.meta.env` with validated values
 * 3. Throws detailed error messages for invalid configurations
 *
 * @param env Optional environment object to validate (defaults to `import.meta.env`)
 *
 * @throws {Error} Detailed validation errors if environment variables are invalid
 */
export function validateEnv(env?: Environment): Environment {
	try {
		return envSchema.parse(env ?? import.meta.env);
	} catch (error) {
		if (error instanceof z.ZodError) {
			const issues = error.issues
				.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
				.join("\n");
			throw new Error(`Invalid environment variables:\n${issues}`);
		}

		throw error;
	}
}

export const env = validateEnv();
