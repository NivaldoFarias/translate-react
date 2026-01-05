import { mock } from "bun:test";

import type { Environment } from "@/utils/";

import { LogLevel, RuntimeEnvironment, validateEnv } from "@/utils/";

/**
 * Mock only the exported `env` constant for global test usage.
 *
 * Individual test files (like env.util.spec.ts) can import the real `validateEnv`
 * function to test its actual validation behavior.
 */
/** Test environment configuration matching the schema from env.util.ts */
export const testEnv: Environment = {
	GH_TOKEN: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD",
	LLM_API_KEY: "sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF1234567890",
	LLM_MODEL: "test-model",
	LLM_API_BASE_URL: "https://openrouter.ai/api/v1",
	REPO_FORK_OWNER: "test-fork-owner",
	REPO_FORK_NAME: "test-fork-repo",
	REPO_UPSTREAM_OWNER: "test-upstream-owner",
	NODE_ENV: RuntimeEnvironment.Test,
	BATCH_SIZE: 5,
	REPO_UPSTREAM_NAME: "test-upstream-repo",
	SOURCE_LANGUAGE: "en",
	TARGET_LANGUAGE: "pt-br",
	HEADER_APP_TITLE: "Test App",
	HEADER_APP_URL: "https://testapp.com",
	LOG_LEVEL: LogLevel.Debug,
	MAX_TOKENS: 4096,
	// @ts-expect-error - actual zod schema validation expects `stringbool`, but type expects boolean
	LOG_TO_CONSOLE: "false",
	GH_REQUEST_TIMEOUT: 60_000,
	LLM_MAX_CONCURRENT: 5,
	LLM_MIN_TIME_MS: 200,
	MIN_SUCCESS_RATE: 0.5,
	PROGRESS_ISSUE_NUMBER: 555,
};

void mock.module("@/utils/env.util", () => {
	return {
		env: testEnv,
		validateEnv,
	};
});
