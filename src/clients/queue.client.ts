import PQueue from "p-queue";

import { env } from "@/utils";

/** Pre-configured instance of LLM-specific {@link PQueue} for application-wide use */
export const queue = new PQueue({ concurrency: env.MAX_LLM_CONCURRENCY });
