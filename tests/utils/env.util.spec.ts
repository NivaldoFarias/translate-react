import { describe, expect, test } from "bun:test";

import { RuntimeEnvironment, validateEnv } from "@/app/utils/";

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

		test("should use defaults when optional OpenRouter header env vars are empty strings", () => {
			const envWithEmptyHeaders = {
				...validEnv,
				HEADER_APP_URL: "",
				HEADER_APP_TITLE: "",
			};

			const env = validateEnv(envWithEmptyHeaders);

			expect(env.HEADER_APP_URL).toBe(validEnv.HEADER_APP_URL);
			expect(env.HEADER_APP_TITLE).toBe(validEnv.HEADER_APP_TITLE);
		});

		test("should use defaults when LLM_MODEL and repo env vars are empty strings", () => {
			const envWithEmptyDefaults = {
				...validEnv,
				LLM_MODEL: "",
				REPO_FORK_OWNER: "",
				REPO_FORK_NAME: "",
				REPO_UPSTREAM_OWNER: "",
				REPO_UPSTREAM_NAME: "",
			};

			const env = validateEnv(envWithEmptyDefaults);

			expect(env.LLM_MODEL).toBe(validEnv.LLM_MODEL);
			expect(env.REPO_FORK_OWNER).toBe(validEnv.REPO_FORK_OWNER);
			expect(env.REPO_FORK_NAME).toBe(validEnv.REPO_FORK_NAME);
			expect(env.REPO_UPSTREAM_OWNER).toBe(validEnv.REPO_UPSTREAM_OWNER);
			expect(env.REPO_UPSTREAM_NAME).toBe(validEnv.REPO_UPSTREAM_NAME);
		});

		test("should use defaults when fence-masking and rate-limit env vars are empty strings", () => {
			const env = validateEnv({
				...validEnv,
				// @ts-expect-error - raw CI env values are strings
				LLM_MAX_REQUESTS_PER_MINUTE: "",
				// @ts-expect-error - raw CI env values are strings
				MASK_VERBATIM_LARGE_FENCES: "",
				// @ts-expect-error - raw CI env values are strings
				MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS: "",
			});

			expect(env.LLM_MAX_REQUESTS_PER_MINUTE).toBe(validEnv.LLM_MAX_REQUESTS_PER_MINUTE);
			expect(env.MASK_VERBATIM_LARGE_FENCES).toBe(validEnv.MASK_VERBATIM_LARGE_FENCES);
			expect(env.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS).toBe(
				validEnv.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS,
			);
		});

		test("should parse string values for fence-masking and rate-limit env vars", () => {
			const env = validateEnv({
				...validEnv,
				// @ts-expect-error - raw CI env values are strings
				LLM_MAX_REQUESTS_PER_MINUTE: "15",
				// @ts-expect-error - raw CI env values are strings
				MASK_VERBATIM_LARGE_FENCES: "true",
				// @ts-expect-error - raw CI env values are strings
				MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS: "200",
			});

			expect(env.LLM_MAX_REQUESTS_PER_MINUTE).toBe(15);
			expect(env.MASK_VERBATIM_LARGE_FENCES).toBe(true);
			expect(env.MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS).toBe(200);
		});

		test('should parse MASK_VERBATIM_LARGE_FENCES "false" as false', () => {
			// @ts-expect-error - raw CI env values are strings
			const env = validateEnv({ ...validEnv, MASK_VERBATIM_LARGE_FENCES: "false" });

			expect(env.MASK_VERBATIM_LARGE_FENCES).toBe(false);
		});

		test("should reject unrecognized MASK_VERBATIM_LARGE_FENCES strings", () => {
			// @ts-expect-error - raw CI env values are strings
			expect(() => validateEnv({ ...validEnv, MASK_VERBATIM_LARGE_FENCES: "maybe" })).toThrow();
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
