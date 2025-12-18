import { beforeEach, describe, expect, test } from "bun:test";

import { RuntimeEnvironment } from "@/utils/constants.util";
import { validateEnv } from "@/utils/env.util";

describe("Environment Utilities", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		Object.assign(import.meta.env, {
			GH_TOKEN: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD",
			OPENAI_API_KEY: "sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF1234567890",
			LLM_MODEL: "test-model",
			REPO_FORK_OWNER: "test-owner",
			REPO_FORK_NAME: "test-repo",
			REPO_UPSTREAM_OWNER: "test-original-owner",
			NODE_ENV: "test",
			FORCE_SNAPSHOT_CLEAR: "false",
			DEV_MODE_FORK_PR: "false",
			LOG_TO_CONSOLE: "false",
		});
	});

	test("should validate correct environment variables", () => {
		const env = validateEnv();
		expect(env.GH_TOKEN).toBe("ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD");
		expect(env.OPENAI_API_KEY).toBe("sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF1234567890");
		expect(env.NODE_ENV).toBe(RuntimeEnvironment.Test);
	});

	test("should throw error for missing required variables", () => {
		(import.meta.env as Record<string, unknown>)["NODE_ENV"] = "invalid-environment";

		expect(() => {
			validateEnv();
		}).toThrow();
	});

	test("should use default values for optional variables", () => {
		const env = validateEnv();
		expect(env.OPENAI_BASE_URL).toBe("https://openrouter.ai/api/v1");
	});

	test("should validate enum values", () => {
		Object.assign(import.meta.env, { NODE_ENV: "invalid" });

		expect(() => {
			validateEnv();
		}).toThrow();
	});
});
