/** Maximum number of tokens that can be translated in a single request */
export const MAX_CHUNK_TOKENS = 4_000;

/** Token buffer reserved for system prompt overhead when determining chunking needs */
export const SYSTEM_PROMPT_TOKEN_RESERVE = 1_000;

/** Token buffer reserved for chunk processing overhead when splitting content */
export const CHUNK_TOKEN_BUFFER = 500;

/** Temperature setting for LLM API calls (lower = more deterministic) */
export const LLM_TEMPERATURE = 0.1;

/** Maximum tokens for connectivity test API call */
export const CONNECTIVITY_TEST_MAX_TOKENS = 5;

/** Minimum acceptable size ratio for translated content (0.5 = 50% of original) */
export const MIN_SIZE_RATIO = 0.5;

/** Maximum acceptable size ratio for translated content (2.0 = 200% of original) */
export const MAX_SIZE_RATIO = 2.0;

/** Minimum acceptable heading ratio for translated content (0.8 = 80% of original) */
export const MIN_HEADING_RATIO = 0.8;

/** Maximum acceptable heading ratio for translated content (1.2 = 120% of original) */
export const MAX_HEADING_RATIO = 1.2;

/** Divisor used for fallback token estimation when encoding fails (chars per token estimate) */
export const TOKEN_ESTIMATION_FALLBACK_DIVISOR = 3.5;

/** Regex pattern to match markdown headings (h1-h6) */
export const HEADINGS_REGEX = /^#{1,6}\s/gm;

/** Regex pattern to match trailing newlines */
export const TRAILING_NEWLINES_REGEX = /\n+$/;

/** Regex pattern to match all newline characters for line ending replacement */
export const LINE_ENDING_REGEX = /\n/g;

/** Number of overlapping tokens between chunks when splitting content */
export const CHUNK_OVERLAP = 200;

/** Common LLM response prefixes that should be removed from translated content */
export const TRANSLATION_PREFIXES = [
	"Here is the translation:",
	"Here's the translation:",
	"Translation:",
	"Translated content:",
	"Here is the translated content:",
	"Here's the translated content:",
] as const;

/** Regex pattern to match fenced code blocks (triple backticks with optional language identifier) */
export const CODE_BLOCK_REGEX = /^```[\s\S]*?^```/gm;

/** Minimum acceptable code block ratio for translated content (0.8 = 80% of original, i.e., >20% difference warns) */
export const MIN_CODE_BLOCK_RATIO = 0.8;

/** Maximum acceptable code block ratio for translated content (1.2 = 120% of original) */
export const MAX_CODE_BLOCK_RATIO = 1.2;

/** Regex pattern to match markdown links: [text](url) and [text](url "title") */
export const MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Minimum acceptable link ratio for translated content (0.8 = 80% of original, i.e., >20% difference warns) */
export const MIN_LINK_RATIO = 0.8;

/** Maximum acceptable link ratio for translated content (1.2 = 120% of original) */
export const MAX_LINK_RATIO = 1.2;

/** Regex pattern to extract YAML frontmatter block (between --- delimiters) */
export const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

/** Regex pattern to extract frontmatter keys (captures key names before colons) */
export const FRONTMATTER_KEY_REGEX = /^([a-zA-Z_][a-zA-Z0-9_]*):/gm;

/** Required frontmatter keys that should be preserved during translation */
export const REQUIRED_FRONTMATTER_KEYS = ["title"] as const;
