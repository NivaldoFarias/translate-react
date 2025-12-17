/**
 * @fileoverview Test setup and configuration for the Bun test runner.
 *
 * This file configures global test environment settings, mocks, and utilities
 * that are used across all test suites in the project.
 *
 * CRITICAL: Environment setup happens BEFORE imports to ensure env.util
 * validation sees test environment configuration.
 */

import type { Environment } from "@/utils";

import { LogLevel, RuntimeEnvironment } from "@/utils/constants.util";

resetTestEnvironment();

/**
 * Resets environment variables to test defaults before each test.
 *
 * Applies environment variables to both {@link process.env} and {@link import.meta.env}
 */
function resetTestEnvironment(): void {
	/**
	 * Set test environment variables BEFORE any other imports.
	 *
	 * This ensures [`env.util.ts`](../src/utils/env.util.ts) can detect test environment during validation
	 */
	const testEnv: Environment = {
		GITHUB_TOKEN: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD",
		OPENAI_API_KEY: "sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF1234567890",
		LLM_MODEL: "test-model",
		OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
		REPO_FORK_OWNER: "test-fork-owner",
		REPO_FORK_NAME: "test-fork-repo",
		REPO_UPSTREAM_OWNER: "test-upstream-owner",
		NODE_ENV: RuntimeEnvironment.Test,
		BUN_ENV: RuntimeEnvironment.Test,
		BATCH_SIZE: 5,
		REPO_UPSTREAM_NAME: "test-upstream-repo",
		SOURCE_LANGUAGE: "en",
		TARGET_LANGUAGE: "pt-br",
		HEADER_APP_TITLE: "Test App",
		HEADER_APP_URL: "https://testapp.com",
		LOG_LEVEL: LogLevel.Debug,
		MAX_TOKENS: 4096,
		LOG_TO_CONSOLE: "false",
		GITHUB_REQUEST_TIMEOUT: 60_000,
	};

	// @ts-expect-error - augmenting globalThis for test environment
	globalThis.mockEnv = testEnv;
	Object.assign(process.env, testEnv);
}
