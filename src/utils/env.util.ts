import { z } from "zod";

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

	GITHUB_TOKEN: z.string().min(1, "GitHub token is required"),

	REPO_FORK_OWNER: z.string().min(1, "Repository owner is required"),
	REPO_FORK_NAME: z.string().min(1, "Repository name is required"),
	REPO_UPSTREAM_OWNER: z.string().min(1, "Original repository owner is required"),

	LLM_MODEL: z.string().min(1, "LLM model is required"),
	OPENAI_API_KEY: z.string().min(1, "LLM API key is required"),
	OPENAI_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
	OPENAI_PROJECT_ID: z.string().min(1, "OpenAI project ID is required"),

	PROGRESS_ISSUE_NUMBER: z
		.union([z.coerce.number().positive(), z.string().length(0), z.undefined()])
		.optional()
		.transform((value) => (value === "" ? undefined : value)),

	FORCE_SNAPSHOT_CLEAR: z.coerce.boolean().default(false),
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
