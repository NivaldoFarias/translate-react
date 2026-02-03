/**
 * Time-to-live for language cache entries in milliseconds.
 *
 * Default: 1 hour (3600000ms). Sufficient for single workflow runs while
 * ensuring stale entries don't persist across separate executions.
 */
export const LANGUAGE_CACHE_TTL_MS = 60 * 60 * 1_000;
