/** Temperature setting for LLM API calls (lower = more deterministic) */
export const LLM_TEMPERATURE = 0.1;

/** Maximum tokens for connectivity test API call */
export const CONNECTIVITY_TEST_MAX_TOKENS = 5;

/** Maximum prose segments packed into one segment-batch LLM request */
export const SEGMENT_BATCH_MAX_ITEMS_PER_BATCH = 55;

/** Maximum follow-up calls that retry only missing segment ids after a partial batch response */
export const SEGMENT_BATCH_MAX_PARTIAL_FOLLOW_UP_ROUNDS = 3;
