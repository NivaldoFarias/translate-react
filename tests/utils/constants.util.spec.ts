import { describe, expect, test } from "bun:test";

import {
	environmentDefaults,
	errorMessages,
	FILE_FETCH_BATCH_SIZE,
	MAX_CHUNK_TOKENS,
	MAX_CONSECUTIVE_FAILURES,
	MIN_API_TOKEN_LENGTH,
	MIN_CACHE_CONFIDENCE,
	processSignals,
	REACT_TRANSLATION_LANGUAGES,
	RuntimeEnvironment,
} from "@/utils/constants.util";

describe("constants.util", () => {
	describe("errorMessages", () => {
		test("invalidKey returns message with key", () => {
			expect(errorMessages.invalidKey("missing")).toBe("Invalid key: missing");
		});
	});

	describe("environmentDefaults", () => {
		test("Development has expected shape", () => {
			const dev = environmentDefaults[RuntimeEnvironment.Development];

			expect(dev.NODE_ENV).toBe(RuntimeEnvironment.Development);
			expect(dev.BATCH_SIZE).toBe(1);
			expect(dev.TARGET_LANGUAGE).toBe("pt-br");
		});

		test("Test has LOG_TO_CONSOLE false", () => {
			const testEnv = environmentDefaults[RuntimeEnvironment.Test];

			expect(testEnv.LOG_TO_CONSOLE).toBe(false);
		});

		test("Production has expected concurrency values", () => {
			const prod = environmentDefaults[RuntimeEnvironment.Production];

			expect(prod.MAX_LLM_CONCURRENCY).toBe(8);
			expect(prod.MAX_GITHUB_CONCURRENCY).toBe(16);
		});
	});

	describe("processSignals", () => {
		test("exposes expected signal names", () => {
			expect(processSignals.interrupt).toBe("SIGINT");
			expect(processSignals.terminate).toBe("SIGTERM");
			expect(processSignals.uncaughtException).toBe("uncaughtException");
			expect(processSignals.unhandledRejection).toBe("unhandledRejection");
		});
	});

	describe("REACT_TRANSLATION_LANGUAGES", () => {
		test("contains pt-br and en", () => {
			expect(REACT_TRANSLATION_LANGUAGES).toContain("pt-br");
			expect(REACT_TRANSLATION_LANGUAGES).toContain("en");
		});

		test("is non-empty array", () => {
			expect(REACT_TRANSLATION_LANGUAGES.length).toBeGreaterThan(0);
		});
	});

	describe("numeric constants", () => {
		test("MAX_CHUNK_TOKENS is positive", () => {
			expect(MAX_CHUNK_TOKENS).toBe(4000);
		});

		test("FILE_FETCH_BATCH_SIZE is positive", () => {
			expect(FILE_FETCH_BATCH_SIZE).toBe(10);
		});

		test("MAX_CONSECUTIVE_FAILURES is positive", () => {
			expect(MAX_CONSECUTIVE_FAILURES).toBe(5);
		});

		test("MIN_CACHE_CONFIDENCE is between 0 and 1", () => {
			expect(MIN_CACHE_CONFIDENCE).toBe(0.8);
		});

		test("MIN_API_TOKEN_LENGTH is positive", () => {
			expect(MIN_API_TOKEN_LENGTH).toBe(20);
		});
	});
});
