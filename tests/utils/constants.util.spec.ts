import { describe, expect, test } from "bun:test";

import {
	ENV_PLACEHOLDERS,
	environmentDefaults,
	errorMessages,
	MIN_API_TOKEN_LENGTH,
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

			// @ts-expect-error - actual zod schema validation expects `stringbool`, but type expects boolean
			expect(testEnv.LOG_TO_CONSOLE).toBe("false");
		});

		test("Production has expected concurrency values", () => {
			const prod = environmentDefaults[RuntimeEnvironment.Production];

			expect(prod.MAX_LLM_CONCURRENCY).toBe(ENV_PLACEHOLDERS.MAX_LLM_CONCURRENCY);
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
		test("MIN_API_TOKEN_LENGTH is positive", () => {
			expect(MIN_API_TOKEN_LENGTH).toBe(20);
		});
	});
});
