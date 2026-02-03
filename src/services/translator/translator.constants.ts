/** Maximum number of tokens that can be translated in a single request */
export const MAX_CHUNK_TOKENS = 4000;

/** Token buffer reserved for system prompt overhead when determining chunking needs */
export const SYSTEM_PROMPT_TOKEN_RESERVE = 1000;

/** Token buffer reserved for chunk processing overhead when splitting content */
export const CHUNK_TOKEN_BUFFER = 500;
