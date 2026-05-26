import type OpenAI from "openai";
import type PQueue from "p-queue";
import type { Options as RetryOptions } from "p-retry";

import type { ReactLanguageCode } from "@/utils/";

import type { TranslationPromptBuilder } from "./translation-prompt.builder";

/** Injected dependencies for {@link TranslationLlmClient} */
export interface TranslationLlmClientDependencies {
	/** OpenAI client instance for LLM API calls */
	openai: OpenAI;

	/** LLM model identifier for chat completions */
	model: string;

	/** Rate limiting queue for LLM API calls */
	queue: PQueue;

	/** Retry configuration for LLM API calls */
	retryConfig: RetryOptions;

	/** Builds system prompts for markdown and frontmatter batch calls */
	promptBuilder: TranslationPromptBuilder;

	/** Estimates input token count for logging and diagnostics */
	estimateInputTokens: (content: string) => number;

	/** Resolves max completion tokens (provider cap or env default) */
	getCompletionTokenCap: () => number;

	/** Resolves document source language before the first LLM call for a file */
	resolveDocumentSourceLanguage: (fullMarkdown: string) => Promise<ReactLanguageCode>;

	/** Optional glossary lines appended to system prompts */
	getTranslationGuidelines: () => string | null;
}
