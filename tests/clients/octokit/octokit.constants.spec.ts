import { describe, expect, test } from "bun:test";

import {
	DEFAULT_RETRY_CONFIG,
	NETWORK_ERROR_PATTERNS,
	RATE_LIMIT_BUFFER_MS,
	RATE_LIMIT_MAX_DELAY_MS,
} from "@/clients/octokit/octokit.constants";

describe("octokit.constants", () => {
	describe("GitHub retry constants", () => {
		test("DEFAULT_RETRY_CONFIG is positive integer", () => {
			expect(DEFAULT_RETRY_CONFIG.retries).toBe(3);
		});

		test("DEFAULT_RETRY_CONFIG.minTimeout is 1 second", () => {
			expect(DEFAULT_RETRY_CONFIG.minTimeout).toBe(1_000);
		});

		test("DEFAULT_RETRY_CONFIG.maxTimeout is 10 seconds", () => {
			expect(DEFAULT_RETRY_CONFIG.maxTimeout).toBe(10_000);
		});

		test("DEFAULT_RETRY_CONFIG.factor is 2", () => {
			expect(DEFAULT_RETRY_CONFIG.factor).toBe(2);
		});

		test("RATE_LIMIT_BUFFER_MS is 1 second", () => {
			expect(RATE_LIMIT_BUFFER_MS).toBe(1_000);
		});

		test("RATE_LIMIT_MAX_DELAY_MS is 5 minutes", () => {
			expect(RATE_LIMIT_MAX_DELAY_MS).toBe(300_000);
		});

		test("NETWORK_ERROR_PATTERNS contains expected patterns", () => {
			expect(NETWORK_ERROR_PATTERNS).toContain("ECONNRESET");
			expect(NETWORK_ERROR_PATTERNS).toContain("ETIMEDOUT");
			expect(NETWORK_ERROR_PATTERNS).toContain("ENOTFOUND");
			expect(NETWORK_ERROR_PATTERNS).toContain("ECONNREFUSED");
			expect(NETWORK_ERROR_PATTERNS).toContain("EAI_AGAIN");
			expect(NETWORK_ERROR_PATTERNS.length).toBe(5);
		});
	});
});
