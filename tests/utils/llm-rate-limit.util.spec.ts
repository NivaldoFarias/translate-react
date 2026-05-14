import { describe, expect, test } from "bun:test";
import { StatusCodes } from "http-status-codes";
import { APIError } from "openai";

import { MS_PER_SECOND } from "@/utils/constants.util";
import {
	getRateLimitResetWaitMs,
	isOpenRouterDailyFreeModelQuotaError,
} from "@/utils/llm-rate-limit.util";

describe("getRateLimitResetWaitMs", () => {
	test("returns 0 for non-API errors", () => {
		expect(getRateLimitResetWaitMs(new Error("boom"), 1_000)).toBe(0);
	});

	test("returns 0 for API errors that are not 429", () => {
		const error = APIError.generate(
			StatusCodes.BAD_REQUEST,
			{ message: "bad" },
			undefined,
			new Headers(),
		);
		expect(getRateLimitResetWaitMs(error, 1_000)).toBe(0);
	});

	test("returns 0 when 429 has no reset header", () => {
		const error = APIError.generate(
			StatusCodes.TOO_MANY_REQUESTS,
			{ message: "slow down" },
			undefined,
			new Headers(),
		);
		expect(getRateLimitResetWaitMs(error, 1_000)).toBe(0);
	});

	test("uses epoch milliseconds from x-ratelimit-reset", () => {
		const now = 1_700_000_000_000;
		const reset = now + 5_000;
		const error = APIError.generate(
			StatusCodes.TOO_MANY_REQUESTS,
			{ message: "rate" },
			undefined,
			new Headers([["x-ratelimit-reset", String(reset)]]),
		);
		const wait = getRateLimitResetWaitMs(error, now);
		expect(wait).toBeGreaterThan(0);
		expect(wait).toBeLessThanOrEqual(5_000 + 750);
	});

	test("treats small numeric reset as Unix seconds", () => {
		const nowMs = 1_700_000_000_000;
		const resetSeconds = Math.floor(nowMs / MS_PER_SECOND) + 12;
		const error = APIError.generate(
			StatusCodes.TOO_MANY_REQUESTS,
			{ message: "rate" },
			undefined,
			new Headers([["x-ratelimit-reset", String(resetSeconds)]]),
		);
		const wait = getRateLimitResetWaitMs(error, nowMs);
		expect(wait).toBeGreaterThan(0);
	});

	test("returns 0 when reset is already in the past", () => {
		const now = 1_700_000_000_000;
		const error = APIError.generate(
			StatusCodes.TOO_MANY_REQUESTS,
			{ message: "rate" },
			undefined,
			new Headers([["x-ratelimit-reset", String(now - 10_000)]]),
		);
		expect(getRateLimitResetWaitMs(error, now)).toBe(0);
	});
});

describe("isOpenRouterDailyFreeModelQuotaError", () => {
	test("returns false for non-429 errors", () => {
		const error = APIError.generate(
			StatusCodes.BAD_REQUEST,
			{ message: "bad" },
			undefined,
			new Headers(),
		);
		expect(isOpenRouterDailyFreeModelQuotaError(error)).toBe(false);
	});

	test("returns false for 429 without daily free-model wording", () => {
		const error = APIError.generate(
			StatusCodes.TOO_MANY_REQUESTS,
			{ message: "Rate limit exceeded: free-models-per-min. " },
			undefined,
			new Headers(),
		);
		expect(isOpenRouterDailyFreeModelQuotaError(error)).toBe(false);
	});

	test("returns true when the nested error body mentions free-models-per-day", () => {
		const error = APIError.generate(
			StatusCodes.TOO_MANY_REQUESTS,
			{
				error: {
					message:
						"Rate limit exceeded: free-models-per-day. Add 5 credits to unlock 1000 free model requests per day",
				},
			},
			undefined,
			new Headers(),
		);
		expect(isOpenRouterDailyFreeModelQuotaError(error)).toBe(true);
	});

	test("returns true when only the top-level message mentions free-models-per-day", () => {
		const error = APIError.generate(
			StatusCodes.TOO_MANY_REQUESTS,
			{},
			"429 Rate limit exceeded: free-models-per-day. Add credits.",
			new Headers(),
		);
		expect(isOpenRouterDailyFreeModelQuotaError(error)).toBe(true);
	});
});
