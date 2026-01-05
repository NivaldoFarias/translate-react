import { describe, expect, test } from "bun:test";

import { RuntimeEnvironment, validateEnv } from "@/utils/";

import { testEnv as validEnv } from "../setup";

describe("Environment Utilities", () => {
	describe("validateEnv", () => {
		test("should validate correct environment variables when valid env is provided", () => {
			const env = validateEnv(validEnv);

			expect(env.GH_TOKEN).toBe("ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD");
			expect(env.LLM_API_KEY).toBe("sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF1234567890");
			expect(env.NODE_ENV).toBe(RuntimeEnvironment.Test);
		});

		test("should throw error when NODE_ENV has invalid value", () => {
			const invalidEnv = { ...validEnv, NODE_ENV: "invalid-environment" };

			// @ts-expect-error - intentionally invalid for testing
			expect(() => validateEnv(invalidEnv)).toThrow();
		});

		test("should use default values for optional variables when not provided", () => {
			const minimalEnv = {
				GH_TOKEN: validEnv.GH_TOKEN,
				LLM_API_KEY: validEnv.LLM_API_KEY,
				NODE_ENV: RuntimeEnvironment.Test,
			};

			// @ts-expect-error - missing optional variables
			const env = validateEnv(minimalEnv);

			expect(env.LLM_API_BASE_URL).toBe("https://openrouter.ai/api/v1");
		});

		test("should throw error when token is too short", () => {
			const invalidEnv = { ...validEnv, GH_TOKEN: "short" };

			expect(() => validateEnv(invalidEnv)).toThrow("GH_TOKEN looks too short");
		});

		test("should throw error when token contains placeholder value", () => {
			const invalidEnv = { ...validEnv, GH_TOKEN: "CHANGE_ME" };

			expect(() => validateEnv(invalidEnv)).toThrow("appears to be a placeholder");
		});

		test("should coerce numeric string values to numbers", () => {
			const envWithStringNumbers = {
				...validEnv,
				MAX_TOKENS: "8192",
				BATCH_SIZE: "10",
			};

			// @ts-expect-error - testing string to number coercion
			const env = validateEnv(envWithStringNumbers);

			expect(env.MAX_TOKENS).toBe(8192);
			expect(env.BATCH_SIZE).toBe(10);
		});
	});
});
