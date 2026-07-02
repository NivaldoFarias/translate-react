import { logger } from "@/app/utils/logger.util";

import { OpenRouterModelRow, openRouterModelsListSchema } from "./openrouter.schemas";

/** Resolved numeric limits for one OpenRouter model id. */
export type OpenRouterModelLimits = Readonly<{
	/** Best-effort context window for routing (tokens). */
	contextLength: number;

	/** Provider cap on completion tokens when present. */
	maxCompletionTokens: number | null;
}>;

/**
 * Loads and caches OpenRouter’s public `GET /v1/models` catalog to resolve `context_length` and
 * `top_provider.max_completion_tokens` for a configured model id.
 *
 * @see {@link https://openrouter.ai/docs/api/api-reference/models/get-models|OpenRouter GET /v1/models}
 */
export class OpenRouterModelLimitsService {
	private readonly logger = logger.child({ component: OpenRouterModelLimitsService.name });

	/** Cached promises for `GET /v1/models` catalog requests by list URL. */
	private readonly inflightByListUrl = new Map<string, Promise<readonly OpenRouterModelRow[]>>();

	/**
	 * Drops cached models list promises so the next lookup refetches (tests or base URL changes).
	 */
	public resetListCache(): void {
		this.inflightByListUrl.clear();
	}

	/**
	 * Returns whether the given OpenAI-compatible base URL targets OpenRouter’s hosted API.
	 *
	 * @param baseUrl `LLM_API_BASE_URL` value (for example `https://openrouter.ai/api/v1`)
	 *
	 * @returns `true` when the host is `openrouter.ai` or a subdomain thereof
	 */
	public isHostedOpenRouterBaseUrl(baseUrl: string) {
		try {
			const host = new URL(baseUrl).hostname;

			return host === "openrouter.ai" || host.endsWith(".openrouter.ai");
		} catch {
			return false;
		}
	}

	/**
	 * Builds the OpenRouter models list URL from an OpenAI-compatible base URL.
	 *
	 * @param baseUrl Base URL ending with `/v1` (no trailing slash required)
	 *
	 * @returns Absolute URL for `GET /v1/models`
	 */
	public resolveModelsListUrl(baseUrl: string) {
		const trimmed = baseUrl.replace(/\/+$/, "");

		return `${trimmed}/models`;
	}

	/**
	 * Fetches the catalog once per `listUrl`, then returns limits for `modelId`.
	 *
	 * @param baseUrl Same `LLM_API_BASE_URL` used for chat completions
	 * @param apiKey Bearer token (`LLM_API_KEY`)
	 * @param modelId Model id to match (for example `openai/gpt-oss-20b:free`)
	 *
	 * @returns Limits when a matching row is found and numeric fields are usable; otherwise `null`
	 */
	public async fetchLimitsForModel(baseUrl: string, apiKey: string, modelId: string) {
		const listUrl = this.resolveModelsListUrl(baseUrl);
		let pending = this.inflightByListUrl.get(listUrl);

		if (!pending) {
			pending = this.loadModelsList(listUrl, apiKey);
			this.inflightByListUrl.set(listUrl, pending);
		}

		try {
			const rows = await pending;

			return this.pickLimitsFromList(rows, modelId);
		} catch {
			this.inflightByListUrl.delete(listUrl);

			return null;
		}
	}

	private async loadModelsList(listUrl: string, apiKey: string) {
		const response = await fetch(listUrl, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			this.logger.warn(
				{ listUrl, status: response.status },
				"OpenRouter models list request failed; keeping static chunk defaults",
			);

			throw new Error(`OpenRouter models HTTP ${response.status}`);
		}

		const json: unknown = await response.json();
		const parsed = openRouterModelsListSchema.safeParse(json);

		if (!parsed.success) {
			this.logger.warn(
				{ issues: parsed.error.issues },
				"OpenRouter models list JSON did not match expected shape",
			);

			throw new Error("OpenRouter models list parse failed");
		}

		return parsed.data.data;
	}

	private pickLimitsFromList(rows: readonly OpenRouterModelRow[], modelId: string) {
		const row =
			rows.find((entry) => entry.id === modelId) ??
			rows.find((entry) => entry.canonical_slug === modelId);

		if (!row) {
			this.logger.warn({ modelId }, "OpenRouter models list has no entry for configured model id");

			return null;
		}

		const topCtx = row.top_provider.context_length;
		const rootCtx = row.context_length;
		const contextCandidates = [topCtx, rootCtx].filter(
			(value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
		);

		if (contextCandidates.length === 0) {
			this.logger.warn(
				{ modelId, rowId: row.id },
				"OpenRouter model entry has no usable context_length",
			);

			return null;
		}

		const contextLength = Math.min(...contextCandidates);
		const rawMax = row.top_provider.max_completion_tokens;

		const maxCompletionTokens =
			typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax > 0 ? rawMax : null;

		return { contextLength, maxCompletionTokens };
	}
}
