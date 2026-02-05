import type { TiktokenModel } from "js-tiktoken";

/** Common LLM response prefixes that should be removed from translated content */
export const TRANSLATION_PREFIXES = [
	"Here is the translation:",
	"Here's the translation:",
	"Translation:",
	"Translated content:",
	"Here is the translated content:",
	"Here's the translated content:",
] as const;

/** Required frontmatter keys that should be preserved during translation */
export const REQUIRED_FRONTMATTER_KEYS = ["title"] as const;

/** Token buffer reserved for system prompt overhead when determining chunking needs */
export const SYSTEM_PROMPT_TOKEN_RESERVE = 1_000;

/** Divisor used for fallback token estimation when encoding fails (chars per token estimate) */
export const TOKEN_ESTIMATION_FALLBACK_DIVISOR = 3.5;

/** Regex pattern to match trailing newlines */
const TRAILING_NEWLINES_REGEX = /\n+$/;

/** Regex pattern to extract frontmatter keys (captures key names before colons) */
const FRONTMATTER_KEY_REGEX = /^([a-zA-Z_][a-zA-Z0-9_]*):/gm;

/** Regex pattern to extract YAML frontmatter block (between --- delimiters) */
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

/** Regex pattern to match markdown links: [text](url) and [text](url "title") */
const MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Regex pattern to match fenced code blocks (triple backticks with optional language identifier) */
const CODE_BLOCK_REGEX = /^```[\s\S]*?^```/gm;

/** Regex pattern to match markdown headings (h1-h6) */
const HEADINGS_REGEX = /^#{1,6}\s/gm;

/** Regex pattern to match all newline characters for line ending replacement */
const LINE_ENDING_REGEX = /\n/g;

/** Regular expressions used in the translation validator manager */
export const REGEXES = {
	trailingNewlines: TRAILING_NEWLINES_REGEX,
	frontmatterKey: FRONTMATTER_KEY_REGEX,
	frontmatter: FRONTMATTER_REGEX,
	markdownLink: MARKDOWN_LINK_REGEX,
	codeBlock: CODE_BLOCK_REGEX,
	headings: HEADINGS_REGEX,
	lineEnding: LINE_ENDING_REGEX,
} as const;

/**
 * Minimum acceptable link ratio for translated content
 * (0.8 = 80% of original, i.e., >20% difference warns)
 */
const MIN_LINK_RATIO = 0.8;

/**
 * Maximum acceptable link ratio for translated content
 * (1.2 = 120% of original)
 */
const MAX_LINK_RATIO = 1.2;

/** Minimum acceptable code block ratio for translated content (0.8 = 80% of original, i.e., >20% difference warns) */
const MIN_CODE_BLOCK_RATIO = 0.8;

/** Maximum acceptable code block ratio for translated content (1.2 = 120% of original) */
const MAX_CODE_BLOCK_RATIO = 1.2;

/** Minimum acceptable size ratio for translated content (0.5 = 50% of original) */
const MIN_SIZE_RATIO = 0.5;

/** Maximum acceptable size ratio for translated content (2.0 = 200% of original) */
const MAX_SIZE_RATIO = 2.0;

/** Minimum acceptable heading ratio for translated content (0.8 = 80% of original) */
const MIN_HEADING_RATIO = 0.8;

/** Maximum acceptable heading ratio for translated content (1.2 = 120% of original) */
const MAX_HEADING_RATIO = 1.2;

/** Ratios used in the translation validator manager */
export const RATIOS = {
	/** Minimum acceptable link ratio for translated content (0.8 = 80% of original, i.e., >20% difference warns) */
	link: {
		min: MIN_LINK_RATIO,
		max: MAX_LINK_RATIO,
	},
	/** Minimum acceptable code block ratio for translated content (0.8 = 80% of original, i.e., >20% difference warns) */
	codeBlock: {
		min: MIN_CODE_BLOCK_RATIO,
		max: MAX_CODE_BLOCK_RATIO,
	},
	/** Minimum acceptable heading ratio for translated content (0.8 = 80% of original) */
	heading: {
		min: MIN_HEADING_RATIO,
		max: MAX_HEADING_RATIO,
	},
	/** Minimum acceptable size ratio for translated content (0.5 = 50% of original) */
	size: {
		min: MIN_SIZE_RATIO,
		max: MAX_SIZE_RATIO,
	},
} as const;

/** Number of overlapping tokens between chunks when splitting content */
const CHUNK_OVERLAP = 200;

/** Token buffer reserved for chunk processing overhead when splitting content */
const CHUNK_TOKEN_BUFFER = 500;

/** Maximum number of tokens that can be translated in a single request */
const MAX_CHUNK_TOKENS = 4_000;

export const CHUNKS = {
	overlap: CHUNK_OVERLAP,
	tokenBuffer: CHUNK_TOKEN_BUFFER,
	maxTokens: MAX_CHUNK_TOKENS,
} as const;

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
