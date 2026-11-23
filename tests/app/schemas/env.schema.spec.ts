import { describe, expect, test } from "bun:test";

import type { Environment } from "@/app/schemas/env.schema";

import { validateEnv } from "@/app/schemas/env.schema";

/**
 * Parses a raw env map the way `import.meta.env` would provide it (string values).
 *
 * @param overrides Raw string env values
 *
 * @returns Validated environment
 */
function parseRawEnv(overrides: Record<string, string>): Environment {
	return validateEnv(overrides as unknown as Environment);
}

const BOOLEAN_ENV_KEYS = ["MASK_VERBATIM_LARGE_FENCES", "LOG_TO_CONSOLE"] as const;

describe("app env.schema boolean variables", () => {
	for (const key of BOOLEAN_ENV_KEYS) {
		describe(key, () => {
			test.each(["false", "0", "no", "off", "FALSE"])('parses "%s" as false', (raw) => {
				expect(parseRawEnv({ [key]: raw })[key]).toBe(false);
			});

			test.each(["true", "1", "yes", "on", "TRUE"])('parses "%s" as true', (raw) => {
				expect(parseRawEnv({ [key]: raw })[key]).toBe(true);
			});

			test("falls back to the default when blank", () => {
				const blank = parseRawEnv({ [key]: "" })[key];
				const unset = parseRawEnv({})[key];

				expect(typeof unset).toBe("boolean");
				expect(blank).toBe(unset);
			});

			test("passes already-parsed booleans through", () => {
				expect(validateEnv({ [key]: false } as unknown as Environment)[key]).toBe(false);
				expect(validateEnv({ [key]: true } as unknown as Environment)[key]).toBe(true);
			});

			test("rejects non-boolean strings", () => {
				expect(() => parseRawEnv({ [key]: "maybe" })).toThrow(key);
			});
		});
	}

	test("MASK_VERBATIM_LARGE_FENCES defaults to false when unset", () => {
		expect(parseRawEnv({}).MASK_VERBATIM_LARGE_FENCES).toBe(false);
	});

	test("GITHUB_ACTIONS treats blank as unset", () => {
		expect(parseRawEnv({ GITHUB_ACTIONS: "" }).GITHUB_ACTIONS).toBeUndefined();
		expect(parseRawEnv({ GITHUB_ACTIONS: "false" }).GITHUB_ACTIONS).toBe(false);
		expect(parseRawEnv({ GITHUB_ACTIONS: "true" }).GITHUB_ACTIONS).toBe(true);
	});
});
