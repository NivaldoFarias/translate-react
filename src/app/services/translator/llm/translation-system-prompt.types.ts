/**
 * Identifies which segment of a chunked body is being translated in one LLM call.
 *
 * Omitted for whole-file translation and for small frontmatter scalar calls.
 */
export type ChunkTranslationProgress = Readonly<{
	index: number;
	total: number;
}>;

/**
 * Selects which system prompt the translation LLM call uses.
 *
 * `segmentBatch` is the default for markdown body prose. `frontmatterBatch` handles YAML
 * `description`. `markdownDocument` remains for the legacy full-body and chunked fallback path.
 */
export type TranslationSystemPromptKind = "markdownDocument" | "frontmatterBatch" | "segmentBatch";
