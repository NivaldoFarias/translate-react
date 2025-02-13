import { z } from "zod";

/**
 * # Environment Configuration Schema
 *
 * Defines and validates the required environment variables for the application.
 * Uses Zod for runtime type checking and validation of environment variables.
 */
const envSchema = z.object({
	GITHUB_TOKEN: z.string().min(1, "GitHub token is required"),
	LLM_API_KEY: z.string().min(1, "OpenAI API key is required"),
	LLM_MODEL: z.string().min(1, "OpenAI model is required"),
	REPO_OWNER: z.string().min(1, "Repository owner is required"),
	REPO_NAME: z.string().min(1, "Repository name is required"),
	ORIGINAL_REPO_OWNER: z.string().min(1, "Original repository owner is required"),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	BUN_ENV: z.enum(["development", "production", "test"]).default("development"),
	TRANSLATION_ISSUE_NUMBER: z.coerce.number().positive("Translation issue number is required"),
	GITHUB_SINCE: z.string().optional(),
	TARGET_LANGUAGE: z.string().min(1, "Target language is required"),
	SOURCE_LANGUAGE: z.string().min(1, "Source language is required"),
});

/**
 * Type definition for the environment configuration
 * Inferred from the Zod schema to ensure type safety
 */
export type Environment = z.infer<typeof envSchema>;

/**
 * # Environment Validator
 *
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

		// Update import.meta.env with parsed and transformed values
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
