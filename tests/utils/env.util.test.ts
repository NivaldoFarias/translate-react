import { beforeEach, describe, expect, test } from "bun:test";

import { validateEnv } from "@/utils/env.util";

/**
 * Test suite for Environment Utilities
 * Tests environment variable validation and parsing
 */
describe("Environment Utilities", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		// Reset import.meta.env for each test
		Object.assign(import.meta.env, {
			GITHUB_TOKEN: "test-token",
			LLM_API_KEY: "test-key",
			LLM_MODEL: "test-model",
			REPO_FORK_OWNER: "test-owner",
			REPO_FORK_NAME: "test-repo",
			REPO_UPSTREAM_OWNER: "test-original-owner",
			NODE_ENV: "test",
			BUN_ENV: "test",
		});
	});

	test("should validate correct environment variables", () => {
		const env = validateEnv();
		expect(env.GITHUB_TOKEN).toBe("test-token");
		expect(env.LLM_API_KEY).toBe("test-key");
		expect(env.NODE_ENV).toBe("test");
	});

	test("should throw error for missing required variables", () => {
		// @ts-expect-error - Mocking private property
		delete import.meta.env.GITHUB_TOKEN;

		expect(() => {
			validateEnv();
		}).toThrow("Invalid environment variables");
	});

	test("should use default values for optional variables", () => {
		const env = validateEnv();
		expect(env.LLM_BASE_URL).toBe("https://openrouter.ai/api/v1");
	});

	test("should validate enum values", () => {
		Object.assign(import.meta.env, { NODE_ENV: "invalid" });

		expect(() => {
			validateEnv();
		}).toThrow();
	});
});
