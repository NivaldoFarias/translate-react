/**
 * Maximum number of consecutive file processing failures before stopping the workflow.
 *
 * Circuit breaker mechanism to prevent wasting resources on systemic failures.
 */
export const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Batch size for concurrent file fetching operations.
 *
 * Balances network efficiency with memory usage during repository tree traversal.
 */
export const FILE_FETCH_BATCH_SIZE = 10;

/**
 * Minimum confidence threshold for language cache hits, on a scale from 0 to 1.
 *
 * Cache entries below this confidence level are treated as cache misses,
 * triggering fresh language detection to ensure accuracy.
 */
export const MIN_CACHE_CONFIDENCE = 0.8;
