import { z } from "zod";

import { homepage, name, version } from "../../package.json";

/**
 * Environment configuration schema for runtime validation.
 * Uses Zod for type checking and validation of environment variables.
 *
 * ## Required Variables
 * - GitHub authentication and repository settings
 * - OpenAI API configuration
 * - Language settings
 * - Environment mode settings
 */
const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	BUN_ENV: z.enum(["development", "production", "test"]).default("development"),

	/** The GitHub Personal Access Token */
	GITHUB_TOKEN: z.string().min(1, "GitHub token is required"),

	/** The owner (user or organization) of the forked repository */
	REPO_FORK_OWNER: z.string().min(1, "Repository owner is required"),

	/** The name of the forked repository */
	REPO_FORK_NAME: z.string().min(1, "Repository name is required"),

	/** Original repository owner */
	REPO_UPSTREAM_OWNER: z.string().min(1, "Original repository owner is required"),

	/** Original repository name */
	REPO_UPSTREAM_NAME: z.string().min(1, "Original repository name is required"),

	/** The LLM model to use */
	LLM_MODEL: z.string().min(1, "LLM model is required"),

	/** The OpenAI API key */
	OPENAI_API_KEY: z.string().min(1, "LLM API key is required"),

	/** The OpenAI API base URL. Defaults to OpenAI API */
	OPENAI_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),

	/** The OpenAI project ID. Used for activity tracking on OpenAI. */
	OPENAI_PROJECT_ID: z.string().min(1, "OpenAI project ID is required").optional(),

	/** The issue number of the progress tracking issue */
	PROGRESS_ISSUE_NUMBER: z
		.union([z.coerce.number().positive(), z.string().length(0), z.undefined()])
		.optional()
		.transform((value) => (value === "" ? undefined : value)),

	/** Whether to clear the snapshot on startup. Used for development. */
	FORCE_SNAPSHOT_CLEAR: z.coerce.boolean().default(false),

	/** The URL of the application. Used for activity tracking on Open Router. */
	HEADER_APP_URL: z.string().url().default(homepage),

	/** The title of the application. Used for activity tracking on Open Router. */
	HEADER_APP_TITLE: z.string().default(`${name} v${version}`),
});

/**
 * Type definition for the environment configuration.
 * Inferred from the Zod schema to ensure type safety.
 */
export type Environment = z.infer<typeof envSchema>;

/**
 * Validates all environment variables against the defined schema.
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
