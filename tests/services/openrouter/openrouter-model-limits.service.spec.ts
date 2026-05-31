import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { OpenRouterModelLimitsService } from "@/app/services/openrouter/openrouter-model-limits.service";

const realFetch = globalThis.fetch;

/**
 * Builds a minimal `Model` object matching OpenRouter’s `GET /v1/models` schema for tests.
 *
 * @see {@link https://openrouter.ai/docs/api/api-reference/models/get-models|List all models}
 */
function openRouterModelFixture(
	input: Readonly<{
		id: string;
		canonical_slug: string;
		context_length: number | null;
		top_provider: Readonly<{
			is_moderated: boolean;
			context_length?: number | null;
			max_completion_tokens?: number | null;
		}>;
		name?: string;
	}>,
) {
	return {
		architecture: {
			input_modalities: ["text"],
			modality: "text->text",
			output_modalities: ["text"],
			instruct_type: null,
			tokenizer: "Other",
		},
		canonical_slug: input.canonical_slug,
		context_length: input.context_length,
		created: 1_700_000_000,
		default_parameters: null,
		description: "",
		id: input.id,
		links: { details: "https://openrouter.ai/api/v1/models/mock/endpoints" },
		name: input.name ?? "Mock model",
		per_request_limits: null,
		pricing: { prompt: "0", completion: "0", request: "0", image: "0" },
		supported_parameters: ["max_tokens", "temperature"],
		supported_voices: null,
		top_provider: {
			is_moderated: input.top_provider.is_moderated,
			context_length: input.top_provider.context_length ?? null,
			max_completion_tokens: input.top_provider.max_completion_tokens ?? null,
		},
	};
}

describe("OpenRouterModelLimitsService", () => {
	const service = new OpenRouterModelLimitsService();

	const mockFetch = mock(
		(_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
			Promise.reject(new Error("mockFetch not configured")),
	);

	beforeEach(() => {
		mockFetch.mockReset();
		globalThis.fetch = mockFetch as unknown as typeof fetch;
		service.resetListCache();
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
		service.resetListCache();
	});

	describe("isHostedOpenRouterBaseUrl", () => {
		test("returns true for openrouter.ai", () => {
			expect(service.isHostedOpenRouterBaseUrl("https://openrouter.ai/api/v1")).toBe(true);
		});

		test("returns true for api subdomain", () => {
			expect(service.isHostedOpenRouterBaseUrl("https://api.openrouter.ai/v1")).toBe(true);
		});

		test("returns false for other hosts", () => {
			expect(service.isHostedOpenRouterBaseUrl("https://api.openai.com/v1")).toBe(false);
		});

		test("returns false for invalid URL", () => {
			expect(service.isHostedOpenRouterBaseUrl("not-a-url")).toBe(false);
		});
	});

	describe("resolveModelsListUrl", () => {
		test("appends /models without duplicating slash", () => {
			expect(service.resolveModelsListUrl("https://openrouter.ai/api/v1")).toBe(
				"https://openrouter.ai/api/v1/models",
			);
		});

		test("strips trailing slashes before appending", () => {
			expect(service.resolveModelsListUrl("https://openrouter.ai/api/v1///")).toBe(
				"https://openrouter.ai/api/v1/models",
			);
		});
	});

	describe("fetchLimitsForModel", () => {
		test("returns null on non-OK response", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: false,
					status: 500,
					json: () => Promise.resolve({}),
				} as Response),
			);

			const result = await service.fetchLimitsForModel(
				"https://openrouter.ai/api/v1",
				"sk-test",
				"acme/model",
			);

			expect(result).toBeNull();
		});

		test("returns limits for matching id", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							data: [
								openRouterModelFixture({
									id: "other/model",
									canonical_slug: "other/model",
									context_length: 8192,
									top_provider: {
										is_moderated: false,
										context_length: 8192,
										max_completion_tokens: 4096,
									},
								}),
								openRouterModelFixture({
									id: "acme/model",
									canonical_slug: "acme/model",
									context_length: 100_000,
									top_provider: {
										is_moderated: false,
										context_length: 99_000,
										max_completion_tokens: 8192,
									},
								}),
							],
						}),
				} as Response),
			);

			const result = await service.fetchLimitsForModel(
				"https://openrouter.ai/api/v1",
				"sk-test",
				"acme/model",
			);

			expect(result).toEqual({
				contextLength: 99_000,
				maxCompletionTokens: 8192,
			});
		});

		test("matches canonical_slug when id differs", async () => {
			mockFetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							data: [
								openRouterModelFixture({
									id: "vendor/foo-20250101",
									canonical_slug: "vendor/foo",
									context_length: 32_768,
									top_provider: {
										is_moderated: false,
										context_length: 32_768,
										max_completion_tokens: null,
									},
								}),
							],
						}),
				} as Response),
			);

			const result = await service.fetchLimitsForModel(
				"https://openrouter.ai/api/v1",
				"sk-test",
				"vendor/foo",
			);

			expect(result).toEqual({
				contextLength: 32_768,
				maxCompletionTokens: null,
			});
		});

		test("isolated instance does not share cache with singleton", async () => {
			const isolated = new OpenRouterModelLimitsService();
			let callCount = 0;
			mockFetch.mockImplementation(() => {
				callCount += 1;

				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							data: [
								openRouterModelFixture({
									id: "solo/model",
									canonical_slug: "solo/model",
									context_length: 4096,
									top_provider: { is_moderated: false, max_completion_tokens: 1024 },
								}),
							],
						}),
				} as Response);
			});

			await isolated.fetchLimitsForModel("https://openrouter.ai/api/v1", "k", "solo/model");
			await service.fetchLimitsForModel("https://openrouter.ai/api/v1", "k", "solo/model");

			expect(callCount).toBe(2);
		});
	});
});
