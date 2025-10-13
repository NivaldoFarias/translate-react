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

/** Environment configuration schema for runtime validation */
const envSchema = z.object({
	/**
	 * Node.js's runtime environment.
	 *
	 * @default "development"
	 */
	NODE_ENV: z.enum(RuntimeEnvironment).default(environmentDefaults.NODE_ENV),

	/**
	 * Bun's runtime environment.
	 *
	 * @default "development"
	 */
	BUN_ENV: z.enum(RuntimeEnvironment).default(environmentDefaults.BUN_ENV),

	/**
	 * Logging level for the application.
	 *
	 * @default "info"
	 */
	LOG_LEVEL: z.enum(LogLevel).default(environmentDefaults.LOG_LEVEL),

	/** The GitHub Personal Access Token */
	GITHUB_TOKEN: createTokenSchema("GITHUB_TOKEN"),

	/** The OpenAI/OpenRouter/etc API key */
	OPENAI_API_KEY: createTokenSchema("OPENAI_API_KEY"),

	/**
	 * The owner _(user or organization)_ of the forked repository.
	 *
	 * @default "nivaldofarias"
	 */
	REPO_FORK_OWNER: z.string().default(environmentDefaults.REPO_FORK_OWNER),

	/**
	 * The name of the forked repository.
	 *
	 * @default "pt-br.react.dev"
	 */
	REPO_FORK_NAME: z.string().default(environmentDefaults.REPO_FORK_NAME),

	/**
	 * Original repository owner.
	 *
	 * @default "reactjs"
	 */
	REPO_UPSTREAM_OWNER: z.string().default(environmentDefaults.REPO_UPSTREAM_OWNER),

	/**
	 * Original repository name.
	 *
	 * @default "pt-br.react.dev"
	 */
	REPO_UPSTREAM_NAME: z.string().default(environmentDefaults.REPO_UPSTREAM_NAME),

	/**
	 * The LLM model to use.
	 *
	 * @default "google/gemini-2.0-flash-exp:free"
	 */
	LLM_MODEL: z.string().default(environmentDefaults.LLM_MODEL),

	/**
	 * The OpenAI/OpenRouter/etc API base URL.
	 *
	 * @default "https://api.openrouter.com/v1"
	 */
	OPENAI_BASE_URL: z.url().default(environmentDefaults.OPENAI_BASE_URL),

	/** The OpenAI project's ID. Used for activity tracking on OpenAI. */
	OPENAI_PROJECT_ID: z.string().optional(),

	/**
	 * The issue number of the progress tracking issue.
	 *
	 * @default 555
	 * @see {@link environmentDefaults.PROGRESS_ISSUE_NUMBER}
	 */
	PROGRESS_ISSUE_NUMBER: z.coerce
		.number()
		.positive()
		.default(environmentDefaults.PROGRESS_ISSUE_NUMBER),

	/** Whether to clear the snapshot on startup. Used for development. */
	FORCE_SNAPSHOT_CLEAR: z.coerce.boolean().default(environmentDefaults.FORCE_SNAPSHOT_CLEAR),

	/**
	 * Whether to create PRs in the fork (development mode) or upstream (production mode).
	 * When true, PRs are created against the fork for development purposes.
	 *
	 * @default false
	 */
	DEV_MODE_FORK_PR: z.coerce.boolean().default(false),

	/**
	 * The URL of the application to override the default URL.
	 * Used for activity tracking on {@link https://openrouter.ai/|OpenRouter}.
	 *
	 * @default `"${pkgJson.homepage}"`
	 */
	HEADER_APP_URL: z.url().default(environmentDefaults.HEADER_APP_URL),

	/**
	 * The title of the application to override the default title.
	 * Used for activity tracking on {@link https://openrouter.ai/|OpenRouter}.
	 *
	 * @default `"${pkgJson.name} v${pkgJson.version}"`
	 */
	HEADER_APP_TITLE: z.string().default(environmentDefaults.HEADER_APP_TITLE),

	/**
	 * The number of items to process in each batch.
	 *
	 * @default 10
	 */
	BATCH_SIZE: z.coerce.number().positive().default(environmentDefaults.BATCH_SIZE),

	/**
	 * The target language for translation.
	 * Must be one of the 38 supported React translation languages.
	 *
	 * @default "pt-br"
	 * @see {@link REACT_TRANSLATION_LANGUAGES}
	 */
	TARGET_LANGUAGE: z.enum(REACT_TRANSLATION_LANGUAGES).default(environmentDefaults.TARGET_LANGUAGE),

	/**
	 * The source language for translation.
	 * Must be one of the 38 supported React translation languages.
	 *
	 * @default "en"
	 * @see {@link REACT_TRANSLATION_LANGUAGES}
	 */
	SOURCE_LANGUAGE: z.enum(REACT_TRANSLATION_LANGUAGES).default(environmentDefaults.SOURCE_LANGUAGE),

	/**
	 * Maximum tokens to generate in a single LLM response.
	 *
	 * @default 8192
	 */
	MAX_TOKENS: z.coerce.number().positive().default(environmentDefaults.MAX_TOKENS),
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
 * @throws {Error} Detailed validation errors if environment variables are invalid
 */
export function validateEnv() {
	try {
		return envSchema.parse(import.meta.env);
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

export const env = validateEnv();
