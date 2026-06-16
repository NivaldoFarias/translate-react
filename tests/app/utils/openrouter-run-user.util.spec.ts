import { describe, expect, test } from "bun:test";

import type { Environment } from "@/app/schemas/env.schema";

import { RuntimeEnvironment } from "@/app/constants";
import { buildOpenRouterRunUserId } from "@/app/utils/openrouter-run-user.util";

function createEnvFixture(overrides: Partial<Environment> = {}): Environment {
	return {
		NODE_ENV: RuntimeEnvironment.Test,
		LOG_LEVEL: "error",
		LLM_MODEL: "test-model",
		LLM_API_BASE_URL: "https://openrouter.ai/api/v1",
		REPO_FORK_OWNER: "owner",
		REPO_FORK_NAME: "repo",
		REPO_UPSTREAM_OWNER: "reactjs",
		REPO_UPSTREAM_NAME: "pt-br.react.dev",
		BATCH_SIZE: 10,
		TARGET_LANGUAGE: "pt-br",
		SOURCE_LANGUAGE: "en",
		MAX_TOKENS: 8192,
		LOG_TO_CONSOLE: false,
		GH_REQUEST_TIMEOUT: 30_000,
		MAX_RETRY_ATTEMPTS: 3,
		MAX_LLM_CONCURRENCY: 1,
		LLM_MAX_REQUESTS_PER_MINUTE: 0,
		MASK_VERBATIM_LARGE_FENCES: false,
		MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS: 120,
		HEADER_APP_URL: "https://example.com",
		HEADER_APP_TITLE: "translate-react",
		...overrides,
	} as Environment;
}

describe("buildOpenRouterRunUserId", () => {
	test("returns gha fingerprint when GitHub Actions context is present", () => {
		const userId = buildOpenRouterRunUserId(
			createEnvFixture({
				GITHUB_ACTIONS: true,
				GITHUB_RUN_ID: "25802803407",
				TARGET_LANGUAGE: "pt-br",
			}),
		);

		expect(userId).toBe("gha-25802803407-pt-br");
	});

	test("returns baseline git sha label for local runs", () => {
		const userId = buildOpenRouterRunUserId(createEnvFixture());

		expect(userId.startsWith("baseline-")).toBe(true);
		expect(userId.length).toBeGreaterThan("baseline-".length);
	});
});
