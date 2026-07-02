import type { TranslationLlmUsageTotals } from "./llm/translation-llm.usage";

import { emptyTranslationLlmUsageTotals } from "./llm/translation-llm.usage";

/** Translation strategy used for the markdown body on the latest {@link TranslatorService.translateContent} call */
export type TranslationPath = "segment" | "segment-noop" | "legacy-full-body" | "legacy-chunked";

/** Per-call state for one {@link TranslatorService.translateContent} invocation */
export interface TranslationFileContext {
	/** Aggregated LLM token and cost usage for the active file */
	llmUsage: TranslationLlmUsageTotals;

	/** Body translation strategy for the active file */
	translationPath: TranslationPath;
}

/**
 * Creates empty per-call translation state for {@link TranslatorService.translateContent}.
 *
 * @returns Fresh {@link TranslationFileContext} for one file translation
 */
export function createTranslationFileContext(): TranslationFileContext {
	return {
		llmUsage: emptyTranslationLlmUsageTotals(),
		translationPath: "segment",
	};
}
