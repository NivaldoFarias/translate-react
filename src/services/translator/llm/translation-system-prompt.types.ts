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
 * `markdownDocument` keeps chunking, verbatim-placeholder, and full doc rules. `frontmatterBatch`
 * uses one structured-output call for the YAML `description` string field when present.
 */
export type TranslationSystemPromptKind = "markdownDocument" | "frontmatterBatch";
