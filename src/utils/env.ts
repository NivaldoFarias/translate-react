import { z } from "zod";

const envSchema = z.object({
	GITHUB_TOKEN: z.string().min(1, "GitHub token is required"),
	OPENAI_API_KEY: z.string().min(1, "OpenAI API key is required"),
	OPENAI_MODEL: z.string().min(1, "OpenAI model is required"),
	REPO_OWNER: z.string().min(1, "Repository owner is required"),
	REPO_NAME: z.string().min(1, "Repository name is required"),
	ORIGINAL_REPO_OWNER: z.string().min(1, "Original repository owner is required"),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	BUN_ENV: z.enum(["development", "production", "test"]).default("development"),
	TRANSLATION_ISSUE_NUMBER: z.coerce.number().positive("Translation issue number is required"),
	GITHUB_SINCE: z.string().optional(),
});

export type Environment = z.infer<typeof envSchema>;

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
