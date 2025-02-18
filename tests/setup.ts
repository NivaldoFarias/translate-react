import { beforeEach } from "bun:test";

/**
 * Test Environment Setup
 * Configures environment variables and global test settings
 */

// Reset environment variables before each test
beforeEach(() => {
	// Set up test environment variables
	const testEnv = {
		GITHUB_TOKEN: "test-token",
		LLM_API_KEY: "test-key",
		LLM_MODEL: "test-model",
		REPO_OWNER: "test-owner",
		REPO_NAME: "test-repo",
		ORIGINAL_REPO_OWNER: "test-original-owner",
		NODE_ENV: "test",
		BUN_ENV: "test",
		LLM_BASE_URL: "https://openrouter.ai/api/v1",
		TRANSLATION_ISSUE_NUMBER: "1",
		GITHUB_SINCE: "2024-01-01T00:00:00Z",
	};

	// Assign to process.env ensuring all values are strings
	process.env = {
		...process.env,
		...Object.fromEntries(Object.entries(testEnv).map(([key, value]) => [key, String(value)])),
	};

	// Set up import.meta.env for tests
	Object.assign(import.meta.env, testEnv);
});
