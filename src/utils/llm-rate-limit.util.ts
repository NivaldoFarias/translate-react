import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";

import { MS_PER_SECOND } from "./constants.util";

/** Extra wait after `x-ratelimit-reset` to absorb clock skew and provider propagation delay */
const RATE_LIMIT_RESET_BUFFER_MS = 750;

/** Refuse to block longer than this when a reset timestamp is far in the future */
const MAX_RATE_LIMIT_RESET_WAIT_MS = 120_000;

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
	if (!(error instanceof APIError) || error.status !== StatusCodes.TOO_MANY_REQUESTS) return 0;

	const raw = getFirstHeaderValue(error.headers, "x-ratelimit-reset", "X-RateLimit-Reset");
	if (!raw) return 0;

	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return 0;

	const resetMs = parsed < 1e12 ? Math.round(parsed * MS_PER_SECOND) : Math.round(parsed);
	const wait = resetMs + RATE_LIMIT_RESET_BUFFER_MS - nowMs;

	if (wait <= 0) return 0;

	return Math.min(wait, MAX_RATE_LIMIT_RESET_WAIT_MS);
}
