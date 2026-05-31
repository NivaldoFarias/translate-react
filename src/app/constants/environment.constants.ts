import { homepage, name, version } from "@package";

import type { ReactLanguageCode } from "./react-translation.constants";

import { LogLevel, RuntimeEnvironment } from "./runtime.constants";

export interface EnvironmentSchemaDefaults {
	NODE_ENV: RuntimeEnvironment;
	LOG_LEVEL: LogLevel;
	GH_TOKEN: string;
	LLM_API_KEY: string;
	OPENAI_PROJECT_ID: string;
	LLM_API_BASE_URL: string;
	HEADER_APP_TITLE: string;
	HEADER_APP_URL: string;
	REPO_FORK_OWNER: string;
	REPO_FORK_NAME: string;
	REPO_UPSTREAM_OWNER: string;
	REPO_UPSTREAM_NAME: string;
	LLM_MODEL: string;
	BATCH_SIZE: number;
	TARGET_LANGUAGE: ReactLanguageCode;
	SOURCE_LANGUAGE: ReactLanguageCode;
	MAX_TOKENS: number;
	LOG_TO_CONSOLE: boolean;
	GH_REQUEST_TIMEOUT: number;
	MAX_LLM_CONCURRENCY: number;
	MAX_RETRY_ATTEMPTS: number;

	/**
	 * When greater than zero, caps how many LLM requests may start per rolling minute across the process
	 * (via {@link https://github.com/sindresorhus/p-queue#intervalCap|p-queue} strict interval). Use for
	 * OpenRouter `free-models-per-min` and similar quotas. `0` disables interval limiting.
	 */
	LLM_MAX_REQUESTS_PER_MINUTE: number;

	/**
	 * When `true`, large fenced blocks become HTML comment placeholders before the LLM and are restored after.
	 */
	MASK_VERBATIM_LARGE_FENCES: boolean;

	/** Minimum estimated tokens (tiktoken) for a fence to be masked when `MASK_VERBATIM_LARGE_FENCES` is on */
	MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS: number;
}

/**
 * Placeholders for the environment schema.
 *
 * Most of these values are overridden by provided environment variables.
 *
 * @see {@link EnvironmentSchemaDefaults}
 */
export const ENV_PLACEHOLDERS = {
	REPO_FORK_OWNER: "nivaldofarias",
	REPO_FORK_NAME: "pt-br.react.dev",
	REPO_UPSTREAM_OWNER: "reactjs",
	REPO_UPSTREAM_NAME: "pt-br.react.dev",
	LLM_MODEL: "google/gemini-2.0-flash-exp:free",
	LLM_API_BASE_URL: "https://openrouter.ai/api/v1",
	HEADER_APP_TITLE: `${name} v${version}`,
	HEADER_APP_URL: homepage,
	TARGET_LANGUAGE: "pt-br",
	SOURCE_LANGUAGE: "en",
	BATCH_SIZE: 1,
	GH_TOKEN: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD",
	LLM_API_KEY: "sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF1234567890",
	OPENAI_PROJECT_ID: "",
	MAX_TOKENS: 8192,
	LOG_TO_CONSOLE: true,
	GH_REQUEST_TIMEOUT: 30_000,
	MAX_RETRY_ATTEMPTS: 3,
	MAX_LLM_CONCURRENCY: 4,
	LLM_MAX_REQUESTS_PER_MINUTE: 0,
	MASK_VERBATIM_LARGE_FENCES: false,
	MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS: 120,
} satisfies Partial<EnvironmentSchemaDefaults>;

export const environmentDefaults: Record<RuntimeEnvironment, EnvironmentSchemaDefaults> = {
	[RuntimeEnvironment.Development]: {
		NODE_ENV: RuntimeEnvironment.Development,
		LOG_LEVEL: LogLevel.Debug,
		...ENV_PLACEHOLDERS,
	},
	[RuntimeEnvironment.Test]: {
		NODE_ENV: RuntimeEnvironment.Test,
		LOG_LEVEL: LogLevel.Debug,
		...ENV_PLACEHOLDERS,
		// @ts-expect-error - actual zod schema validation expects `stringbool`, but type expects boolean
		LOG_TO_CONSOLE: "false",
	},
	[RuntimeEnvironment.Staging]: {
		NODE_ENV: RuntimeEnvironment.Staging,
		LOG_LEVEL: LogLevel.Info,
		...ENV_PLACEHOLDERS,
		BATCH_SIZE: 10,
	},
	[RuntimeEnvironment.Production]: {
		NODE_ENV: RuntimeEnvironment.Production,
		LOG_LEVEL: LogLevel.Warn,
		...ENV_PLACEHOLDERS,
		BATCH_SIZE: 10,
		LOG_TO_CONSOLE: false,
	},
};
