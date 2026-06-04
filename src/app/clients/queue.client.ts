import PQueue from "p-queue";

import type { Environment } from "@/app/schemas/env.schema";

import { env } from "@/app/schemas/env.schema";

/** Rolling window length when {@link Environment.LLM_MAX_REQUESTS_PER_MINUTE} is enabled */
const LLM_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Builds `p-queue` options from LLM concurrency and optional per-minute rate cap env vars.
 *
 * @returns Queue options with `intervalCap` when `LLM_MAX_REQUESTS_PER_MINUTE` is set
 */
function buildLlmQueueOptions() {
	const concurrency = env.MAX_LLM_CONCURRENCY;
	const perMinute = env.LLM_MAX_REQUESTS_PER_MINUTE;

	if (perMinute > 0) {
		return {
			concurrency,
			intervalCap: perMinute,
			interval: LLM_RATE_LIMIT_WINDOW_MS,
			strict: true,
		} as const;
	}

	return { concurrency } as const;
}

/** Application-wide LLM queue: concurrency plus optional strict requests-per-minute cap */
export const queue = new PQueue(buildLlmQueueOptions());
