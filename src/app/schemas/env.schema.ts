import { z } from "zod";

import type { EnvironmentSchemaDefaults } from "@/app/constants";

import {
	environmentDefaults,
	LogLevel,
	REACT_TRANSLATION_LANGUAGES,
	RuntimeEnvironment,
} from "@/app/constants";
import { createGithubTokenSchema } from "@/shared/schemas/github-token.schema";

const envDefaults = resolveEnvDefaults();

/** Environment configuration schema for runtime validation */
const envSchema = z.object({
	/** Node.js's runtime environment */
	NODE_ENV: z.enum(RuntimeEnvironment).default(envDefaults.NODE_ENV),

	/** Logging level for the application */
	LOG_LEVEL: z.enum(LogLevel).default(envDefaults.LOG_LEVEL),

	/** The GitHub Personal Access Token (optional in test environment) */
	GH_TOKEN:
		isTestEnvironment() ?
			createGithubTokenSchema("GH_TOKEN").optional()
		:	createGithubTokenSchema("GH_TOKEN"),

	/**
	 * Optional GitHub Personal Access Token for fallback authentication.
	 *
	 * Used when the primary token (GitHub App bot) receives 403 errors due to
	 * insufficient permissions. The fallback client automatically retries with
	 * this PAT when configured.
	 */
	GH_PAT_TOKEN: createGithubTokenSchema("GH_PAT_TOKEN").optional(),

	/** The OpenAI/OpenRouter/etc API key (optional in test environment) */
	LLM_API_KEY:
		isTestEnvironment() ?
			createGithubTokenSchema("LLM_API_KEY").optional()
		:	createGithubTokenSchema("LLM_API_KEY"),

	/** The forked repository's owner */
	REPO_FORK_OWNER: z.string().default(envDefaults.REPO_FORK_OWNER),

	/** The name of the forked repository */
	REPO_FORK_NAME: z.string().default(envDefaults.REPO_FORK_NAME),

	/**
	 * Upstream repository owner (`reactjs` for official React docs).
	 *
	 * Override in `.env` or GitHub Actions variable `REPO_UPSTREAM_OWNER` when testing
	 * (e.g. point PRs at your fork as the logical upstream for every matrix locale).
	 */
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
	HEADER_APP_URL: optionalEnvUrl(envDefaults.HEADER_APP_URL),

	/**
	 * The title of the application to override the default title.
	 *
	 * Used for activity tracking on {@link https://openrouter.ai/|OpenRouter}.
	 */
	HEADER_APP_TITLE: optionalEnvString(envDefaults.HEADER_APP_TITLE),

	/** The number of items to process in each batch */
	BATCH_SIZE: z.coerce.number().positive().default(envDefaults.BATCH_SIZE),

	/**
	 * The target language for translation.
	 *
	 * Must be one of the 38 supported React translation languages. GitHub Actions passes
	 * `matrix.lang` via `--lang` (see `.github/workflows/workflow.yml` and `translation-cli.util.ts`).
	 *
	 * @see {@link REACT_TRANSLATION_LANGUAGES}
	 */
	TARGET_LANGUAGE: z.enum(REACT_TRANSLATION_LANGUAGES).default(envDefaults.TARGET_LANGUAGE),

	/**
	 * The source language for translation and language-detector display names.
	 *
	 * Official React docs use English (`en`). Defaults match that; the translation workflow
	 * does not set this variable.
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

	/** Maximum retry attempts for translation errors */
	MAX_RETRY_ATTEMPTS: z.coerce.number().positive().default(envDefaults.MAX_RETRY_ATTEMPTS),

	/** Concurrency limit for LLM requests */
	MAX_LLM_CONCURRENCY: z.coerce.number().positive().default(envDefaults.MAX_LLM_CONCURRENCY),

	/**
	 * Caps how many LLM requests may **start** per rolling 60s window (strict sliding window via `p-queue`).
	 *
	 * Set to `0` to disable. For OpenRouter free models (`free-models-per-min`), use `15` or `16` and keep
	 * `MAX_LLM_CONCURRENCY` low (for example `1`). This does not affect OpenRouter's separate `free-models-per-day` cap.
	 */
	LLM_MAX_REQUESTS_PER_MINUTE: z.coerce
		.number()
		.int()
		.min(0)
		.default(envDefaults.LLM_MAX_REQUESTS_PER_MINUTE),

	/**
	 * Optional explicit filename for the translation guidelines file.
	 *
	 * When set, bypasses auto-discovery and fetches this specific file from the
	 * upstream repository root. Use when the repo's guidelines file doesn't match
	 * any of the common naming conventions in {@link TRANSLATION_GUIDELINES_CANDIDATES}.
	 *
	 * @example "GLOSSARY.md" // for pt-br.react.dev
	 * @example "TRANSLATION.md" // for ru.react.dev
	 */
	TRANSLATION_GUIDELINES_FILE: z.string().optional(),

	/**
	 * When enabled, fences at or above `MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS` become HTML placeholders before the LLM; restored after. Prose inside those fences is not translated while masked.
	 */
	MASK_VERBATIM_LARGE_FENCES: z.coerce.boolean().default(envDefaults.MASK_VERBATIM_LARGE_FENCES),

	/** `Tiktoken` threshold (same estimator as chunking) for treating a fence as verbatim */
	MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS: z.coerce
		.number()
		.positive()
		.default(envDefaults.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS),

	/**
	 * Set by the GitHub Actions runner when present; enables workflow run URLs in PR bodies and issue comments.
	 */
	GITHUB_ACTIONS: z.stringbool().optional(),

	/** GitHub host URL for the run (e.g. `https://github.com`) */
	GITHUB_SERVER_URL: z.string().optional(),

	/** `owner/repo` for the repository where the workflow executes */
	GITHUB_REPOSITORY: z.string().optional(),

	/** Numeric workflow run id */
	GITHUB_RUN_ID: z.string().optional(),

	/** Workflow display name from the workflow file `name` field */
	GITHUB_WORKFLOW: z.string().optional(),

	/** Full ref that triggered the workflow (e.g. `refs/heads/main`, `refs/tags/v1.0.0`) */
	GITHUB_REF: z.string().optional(),

	/** Short ref name (branch or tag without `refs/heads/` / `refs/tags/`) */
	GITHUB_REF_NAME: z.string().optional(),
});

/** Type definition for the environment configuration */
export type Environment = z.infer<typeof envSchema>;

export const env = validateEnv();

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

/**
 * Resolves the environment defaults based on the current {@link import.meta.env.NODE_ENV}.
 *
 * If the environment variable is not set or is invalid, defaults to {@link RuntimeEnvironment.Development}.
 */
function resolveEnvDefaults(): EnvironmentSchemaDefaults {
	const nodeEnv = import.meta.env.NODE_ENV as RuntimeEnvironment | undefined;

	if (nodeEnv && Object.values(RuntimeEnvironment).includes(nodeEnv)) {
		return environmentDefaults[nodeEnv];
	}

	return environmentDefaults[RuntimeEnvironment.Development];
}

/** Detects if running in test environment */
function isTestEnvironment(): boolean {
	return import.meta.env.NODE_ENV === RuntimeEnvironment.Test;
}

/**
 * Treats unset GitHub Actions / `.env` values as missing so schema defaults apply.
 *
 * `vars.HEADER_APP_*` and `KEY=` in `.env` often become `""`, which bypasses Zod `.default()`.
 */
function emptyEnvValueToUndefined(value: unknown): unknown {
	if (value === "" || value === undefined) {
		return undefined;
	}

	return value;
}

/** Optional env string with production defaults when unset or empty */
function optionalEnvString(defaultValue: string) {
	return z.preprocess(emptyEnvValueToUndefined, z.string().optional().default(defaultValue));
}

/** Optional env URL with production defaults when unset or empty */
function optionalEnvUrl(defaultValue: string) {
	return z.preprocess(emptyEnvValueToUndefined, z.url().optional().default(defaultValue));
}
