import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";
import { AbortError } from "p-retry";

import { MS_PER_SECOND } from "@/app/constants";
import { flattenOpenAiStyleErrorPayload } from "@/shared/errors/";

/** Extra wait after `x-ratelimit-reset` to absorb clock skew and provider propagation delay */
const RATE_LIMIT_RESET_BUFFER_MS = 750;

/** Refuse to block longer than this when a reset timestamp is far in the future */
const MAX_RATE_LIMIT_RESET_WAIT_MS = 120_000;

/** OpenRouter body snippet when the account has exhausted the daily free-model allowance */
const OPENROUTER_FREE_MODELS_PER_DAY = "free-models-per-day";

/** OpenRouter 403 body snippet when the API key has used its spending limit */
const OPENROUTER_KEY_LIMIT_EXCEEDED = "key limit exceeded";

/**
 * Narrows unknown failures to OpenAI-compatible 429 responses without relying on `instanceof` across package entry points.
 *
 * @param error The thrown value from the OpenAI-compatible client
 *
 * @returns `true` when `error` is an object with HTTP 429 status and string message
 */
function isOpenAiCompatible429Error(
	error: unknown,
): error is { status: number; message: string; headers?: unknown; error?: unknown } {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		error.status === StatusCodes.TOO_MANY_REQUESTS &&
		"message" in error &&
		typeof (error as { message: unknown }).message === "string"
	);
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
 * Returns whether an LLM error means the account or API key has no credit left.
 *
 * OpenRouter answers 402 when the account balance runs out and 403 "Key limit exceeded" when the
 * key's own spending limit is reached. Neither recovers on retry. Other 403 responses, such as
 * moderation refusals, are not matched.
 *
 * @param error Caught rejection from an LLM call
 *
 * @returns `true` for exhausted account credit or key limit
 */
export function isLlmCreditExhaustedError(error: unknown): boolean {
	if (error instanceof AbortError) return isLlmCreditExhaustedError(error.originalError);

	if (!(error instanceof APIError)) return false;

	if (error.status === StatusCodes.PAYMENT_REQUIRED) return true;

	const haystack = `${error.message}\n${flattenOpenAiStyleErrorPayload(error.error)}`.toLowerCase();

	return error.status === StatusCodes.FORBIDDEN && haystack.includes(OPENROUTER_KEY_LIMIT_EXCEEDED);
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
