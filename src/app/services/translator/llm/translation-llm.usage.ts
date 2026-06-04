import type OpenAI from "openai";

/** Aggregated token and cost usage for one or more LLM completions */
export interface TranslationLlmUsageTotals {
	/** Sum of prompt tokens across completions */
	promptTokens: number;

	/** Sum of completion tokens across completions */
	completionTokens: number;

	/** Sum of total tokens across completions */
	totalTokens: number;

	/** Sum of OpenRouter `usage.cost` when present; `null` when no cost was reported */
	costUsd: number | null;
}

/** Single completion usage snapshot */
export interface TranslationLlmUsageSnapshot {
	readonly promptTokens: number;
	readonly completionTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number | null;
}

/**
 * Returns zeroed usage totals for a new file translation.
 *
 * @returns Empty token and cost totals
 */
export function emptyTranslationLlmUsageTotals(): TranslationLlmUsageTotals {
	return {
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
		costUsd: null,
	};
}

/**
 * Reads token fields and optional OpenRouter cost from a chat completion usage object.
 *
 * @param usage Completion usage from the provider, if any
 *
 * @returns Snapshot for accumulation, or `null` when usage is missing
 */
export function extractTranslationLlmUsageFromCompletion(
	usage: OpenAI.Chat.Completions.ChatCompletion["usage"] | undefined,
): TranslationLlmUsageSnapshot | null {
	if (!usage) return null;

	const promptTokens = usage.prompt_tokens;
	const completionTokens = usage.completion_tokens;
	const totalTokens = usage.total_tokens;
	const usageWithCost = usage as OpenAI.Chat.Completions.ChatCompletion["usage"] & {
		cost?: number;
	};
	const costUsd = typeof usageWithCost.cost === "number" ? usageWithCost.cost : null;

	return { promptTokens, completionTokens, totalTokens, costUsd };
}

/**
 * Merges a completion snapshot into running per-file totals.
 *
 * @param accumulator Running totals for the current file
 * @param snapshot Usage from one completion, if reported
 *
 * @returns Updated accumulator
 */
export function mergeTranslationLlmUsage(
	accumulator: TranslationLlmUsageTotals,
	snapshot: TranslationLlmUsageSnapshot | null,
): TranslationLlmUsageTotals {
	if (!snapshot) return accumulator;

	const mergedCost =
		accumulator.costUsd === null && snapshot.costUsd === null ?
			null
		:	(accumulator.costUsd ?? 0) + (snapshot.costUsd ?? 0);

	return {
		promptTokens: accumulator.promptTokens + snapshot.promptTokens,
		completionTokens: accumulator.completionTokens + snapshot.completionTokens,
		totalTokens: accumulator.totalTokens + snapshot.totalTokens,
		costUsd: mergedCost,
	};
}
