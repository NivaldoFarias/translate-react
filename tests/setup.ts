/**
 * @fileoverview Test setup and configuration for the Bun test runner.
 *
 * This file configures global test environment settings, mocks, and utilities
 * that are used across all test suites in the project.
 *
 * CRITICAL: Environment setup happens BEFORE imports to ensure env.util
 * validation sees test environment configuration.
 */

import { LogLevel, RuntimeEnvironment } from "@/utils/constants.util";

// Set test environment variables BEFORE any other imports
// This ensures env.util.ts can detect test environment during validation
const testEnv = {
	GITHUB_TOKEN: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD",
	OPENAI_API_KEY: "sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF1234567890",
	LLM_MODEL: "test-model",
	OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
	REPO_FORK_OWNER: "test-fork-owner",
	REPO_FORK_NAME: "test-fork-repo",
	REPO_UPSTREAM_OWNER: "test-upstream-owner",
	NODE_ENV: RuntimeEnvironment.Test,
	BUN_ENV: RuntimeEnvironment.Test,
	BATCH_SIZE: "5",
	FORCE_SNAPSHOT_CLEAR: "false",
	REPO_UPSTREAM_NAME: "test-upstream-repo",
	SOURCE_LANGUAGE: "en",
	TARGET_LANGUAGE: "pt-br",
	HEADER_APP_TITLE: "Test App",
	HEADER_APP_URL: "https://testapp.com",
	PROGRESS_ISSUE_NUMBER: "1",
	DEV_MODE_FORK_PR: "false",
	OPENAI_PROJECT_ID: "test-project-id",
	LOG_LEVEL: LogLevel.Info,
	MAX_TOKENS: "4096",
	LOG_TO_CONSOLE: "false",
	GITHUB_REQUEST_TIMEOUT: "60000",
};

// Apply environment variables to both process.env and import.meta.env
Object.assign(process.env, testEnv);
if (typeof import.meta.env === "object") {
	Object.assign(import.meta.env, testEnv);
}

/** Global test configuration and setup utilities */
declare global {
	namespace globalThis {
		/** Mock environment configuration for testing */
		var mockEnv: Record<string, string>;
	}
}

/** Default mock environment configuration used across tests */
globalThis.mockEnv = testEnv;

/** Reset environment variables to test defaults before each test */
function resetTestEnvironment(): void {
	Object.assign(process.env, globalThis.mockEnv);

	if (typeof import.meta.env === "object") {
		Object.assign(import.meta.env, globalThis.mockEnv);
	}
}

resetTestEnvironment();

export { resetTestEnvironment };
