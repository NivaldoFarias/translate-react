import { StatusCodes } from "http-status-codes";

import { MS_PER_SECOND } from "@/app/constants";

/** Extra wait after `x-ratelimit-reset` to absorb clock skew and provider propagation delay */
const RATE_LIMIT_RESET_BUFFER_MS = 750;

/** Refuse to block longer than this when a reset timestamp is far in the future */
const MAX_RATE_LIMIT_RESET_WAIT_MS = 120_000;

/** OpenRouter body snippet when the account has exhausted the daily free-model allowance */
const OPENROUTER_FREE_MODELS_PER_DAY = "free-models-per-day";

/**
 * Narrows unknown failures to OpenAI-compatible 429 responses without relying on `instanceof` across package entry points.
 *
 * @param error The thrown value from the OpenAI-compatible client
 */
function isOpenAiCompatible429Error(
	error: unknown,
): error is { status: number; message: string; headers?: unknown; error?: unknown } {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		(error as { status: unknown }).status === StatusCodes.TOO_MANY_REQUESTS &&
		"message" in error &&
		typeof (error as { message: unknown }).message === "string"
	);
}

/**
 * Flattens nested OpenAI-style error payloads into searchable text for quota heuristics.
 *
 * @param value The nested `error` field from an OpenAI-compatible API error, when present
 *
 * @returns Concatenated string fragments, or an empty string when nothing useful is present
 */
function flattenOpenAiStyleErrorPayload(value: unknown): string {
	if (value === null || value === undefined) return "";

	if (typeof value === "string") return value;

	if (typeof value === "number" || typeof value === "boolean") return String(value);

	if (typeof value === "object") {
		const record = value as { message?: unknown; error?: unknown };

		if (typeof record.message === "string" && record.message.trim().length > 0) {
			return record.message;
		}

		if (record.error !== undefined) {
			const nested = flattenOpenAiStyleErrorPayload(record.error);
			if (nested.length > 0) return nested;
		}

		try {
			return JSON.stringify(value);
		} catch {
			return "";
		}
	}

	return "";
}

/**
 * Detects OpenRouter's daily free-model cap, where short backoff retries only waste time and quota headroom.
 *
 * @param error The thrown value from the OpenAI-compatible client
 *
 * @returns `true` when the response indicates `free-models-per-day`
 */
export function isOpenRouterDailyFreeModelQuotaError(error: unknown) {
	if (!isOpenAiCompatible429Error(error)) return false;

	const haystack = `${error.message}\n${flattenOpenAiStyleErrorPayload(error.error)}`.toLowerCase();

	return haystack.includes(OPENROUTER_FREE_MODELS_PER_DAY);
}

/**
 * Reads the first non-empty string header from an OpenAI-compatible `headers` bag without relying on its static type.
 *
 * @param source The `headers` property from an API error response
 * @param names Header names to try in order (case-sensitive per `Headers.get` rules)
 *
 * @returns Trimmed header value, or `undefined` when missing or not a string
 */
function getFirstHeaderValue(source: unknown, ...names: string[]) {
	if (source === null || source === undefined || typeof source !== "object") return;

	const candidate = source as { get?: unknown };
	if (typeof candidate.get !== "function") return;

	const get = candidate.get.bind(source) as (name: string) => unknown;

	for (const name of names) {
		const value = get(name);
		if (typeof value !== "string") continue;

		const trimmed = value.trim();
		if (trimmed.length > 0) return trimmed;
	}
}

/**
 * Computes how long to wait before the next LLM retry after a 429, using provider reset headers when present.
 *
 * OpenRouter and similar gateways expose `x-ratelimit-reset` as epoch milliseconds. When the header is missing
 * or already in the past, returns `0` so callers rely on ordinary exponential backoff only.
 *
 * @param error The thrown value from the OpenAI-compatible client
 * @param nowMs Monotonic wall time in milliseconds (injectable for tests)
 *
 * @returns Milliseconds to sleep before retrying, or `0` when no reset-based wait applies
 */
export function getRateLimitResetWaitMs(error: unknown, nowMs = Date.now()) {
	if (!isOpenAiCompatible429Error(error)) return 0;

	const raw = getFirstHeaderValue(error.headers, "x-ratelimit-reset", "X-RateLimit-Reset");
	if (!raw) return 0;

	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return 0;

	const resetMs = parsed < 1e12 ? Math.round(parsed * MS_PER_SECOND) : Math.round(parsed);
	const wait = resetMs + RATE_LIMIT_RESET_BUFFER_MS - nowMs;

	if (wait <= 0) return 0;

	return Math.min(wait, MAX_RATE_LIMIT_RESET_WAIT_MS);
}
