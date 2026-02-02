import PQueue from "p-queue";

import { env } from "@/utils";

/** Pre-configured instance of Github-specific {@link PQueue} for application-wide use */
export const githubQueue = new PQueue({ concurrency: env.MAX_GITHUB_CONCURRENCY });

/** Pre-configured instance of LLM-specific {@link PQueue} for application-wide use */
export const llmQueue = new PQueue({ concurrency: env.MAX_LLM_CONCURRENCY });
