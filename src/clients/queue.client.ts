import PQueue from "p-queue";

/** Pre-configured instance of Github-specific {@link PQueue} for application-wide use */
export const githubQueue = new PQueue({ concurrency: 5 });

/** Pre-configured instance of LLM-specific {@link PQueue} for application-wide use */
export const llmQueue = new PQueue({ concurrency: 3 });
