import type { TiktokenModel } from "js-tiktoken";

/** Token buffer reserved for system prompt overhead when determining chunking needs */
export const SYSTEM_PROMPT_TOKEN_RESERVE = 1_000;

/** Divisor used for fallback token estimation when encoding fails (chars per token estimate) */
export const TOKEN_ESTIMATION_FALLBACK_DIVISOR = 3.5;

export const CHUNKS = {
	/**
	 * Overlapping tokens between adjacent chunks passed to `MarkdownTextSplitter`.
	 *
	 * Kept at zero because reassembly is plain concatenation with preserved separators;
	 * non-zero overlap would send the same source span to multiple LLM calls and can
	 * duplicate translated paragraphs at chunk boundaries.
	 */
	overlap: 0,

	/**
	 * Maximum translate passes over chunked markdown when slice-level terminology drift is detected.
	 *
	 * Initial parallel translation counts as pass one; one selective slice retry is pass two.
	 * Further drift is left to full-document post-translation guards and pipeline retries.
	 */
	terminologyConsistencyMaxPasses: 2,

	/** Token buffer reserved for chunk processing overhead when splitting content */
	tokenBuffer: 500,

	/** Maximum number of tokens that can be translated in a single request */
	maxTokens: 4_000,
} as const;

/**
 * Tokens reserved below the provider completion cap when deriving per-chunk input budgets
 * so translated output is less likely to hit `max_tokens` mid-chunk.
 */
export const CHUNK_OUTPUT_COMPLETION_RESERVE = 384;

/**
 * Conservative upper bound on completion tokens per source token for markdown translation.
 *
 * Some target languages (German, Russian, pt-BR) expand significantly versus English source,
 * and Gemini's tokenizer differs from tiktoken. A 1.5x ratio provides headroom to avoid
 * hitting `max_tokens` mid-translation on large chunks.
 */
export const TRANSLATION_OUTPUT_TO_INPUT_TOKEN_RATIO = 1.5;

/** Default tiktoken model to use for token counting */
export const DEFAULT_TIKTOKEN_MODEL = "gpt-5";

/** Supported tiktoken models */
export const SUPPORTED_TIKTOKEN_MODELS: TiktokenModel[] = [
	"davinci-002",
	"babbage-002",
	"text-davinci-003",
	"text-davinci-002",
	"text-davinci-001",
	"text-curie-001",
	"text-babbage-001",
	"text-ada-001",
	"davinci",
	"curie",
	"babbage",
	"ada",
	"code-davinci-002",
	"code-davinci-001",
	"code-cushman-002",
	"code-cushman-001",
	"davinci-codex",
	"cushman-codex",
	"text-davinci-edit-001",
	"code-davinci-edit-001",
	"text-embedding-ada-002",
	"text-embedding-3-small",
	"text-embedding-3-large",
	"text-similarity-davinci-001",
	"text-similarity-curie-001",
	"text-similarity-babbage-001",
	"text-similarity-ada-001",
	"text-search-davinci-doc-001",
	"text-search-curie-doc-001",
	"text-search-babbage-doc-001",
	"text-search-ada-doc-001",
	"code-search-babbage-code-001",
	"code-search-ada-code-001",
	"gpt2",
	"gpt-3.5-turbo",
	"gpt-35-turbo",
	"gpt-3.5-turbo-0301",
	"gpt-3.5-turbo-0613",
	"gpt-3.5-turbo-1106",
	"gpt-3.5-turbo-0125",
	"gpt-3.5-turbo-16k",
	"gpt-3.5-turbo-16k-0613",
	"gpt-3.5-turbo-instruct",
	"gpt-3.5-turbo-instruct-0914",
	"gpt-4",
	"gpt-4-0314",
	"gpt-4-0613",
	"gpt-4-32k",
	"gpt-4-32k-0314",
	"gpt-4-32k-0613",
	"gpt-4-turbo",
	"gpt-4-turbo-2024-04-09",
	"gpt-4-turbo-preview",
	"gpt-4-1106-preview",
	"gpt-4-0125-preview",
	"gpt-4-vision-preview",
	"gpt-4o",
	"gpt-4o-2024-05-13",
	"gpt-4o-2024-08-06",
	"gpt-4o-2024-11-20",
	"gpt-4o-mini-2024-07-18",
	"gpt-4o-mini",
	"gpt-4o-search-preview",
	"gpt-4o-search-preview-2025-03-11",
	"gpt-4o-mini-search-preview",
	"gpt-4o-mini-search-preview-2025-03-11",
	"gpt-4o-audio-preview",
	"gpt-4o-audio-preview-2024-12-17",
	"gpt-4o-audio-preview-2024-10-01",
	"gpt-4o-mini-audio-preview",
	"gpt-4o-mini-audio-preview-2024-12-17",
	"o1",
	"o1-2024-12-17",
	"o1-mini",
	"o1-mini-2024-09-12",
	"o1-preview",
	"o1-preview-2024-09-12",
	"o1-pro",
	"o1-pro-2025-03-19",
	"o3",
	"o3-2025-04-16",
	"o3-mini",
	"o3-mini-2025-01-31",
	"o4-mini",
	"o4-mini-2025-04-16",
	"chatgpt-4o-latest",
	"gpt-4o-realtime",
	"gpt-4o-realtime-preview-2024-10-01",
	"gpt-4o-realtime-preview-2024-12-17",
	"gpt-4o-mini-realtime-preview",
	"gpt-4o-mini-realtime-preview-2024-12-17",
	"gpt-4.1",
	"gpt-4.1-2025-04-14",
	"gpt-4.1-mini",
	"gpt-4.1-mini-2025-04-14",
	"gpt-4.1-nano",
	"gpt-4.1-nano-2025-04-14",
	"gpt-4.5-preview",
	"gpt-4.5-preview-2025-02-27",
	"gpt-5",
	"gpt-5-2025-08-07",
	"gpt-5-nano",
	"gpt-5-nano-2025-08-07",
	"gpt-5-mini",
	"gpt-5-mini-2025-08-07",
	"gpt-5-chat-latest",
];
