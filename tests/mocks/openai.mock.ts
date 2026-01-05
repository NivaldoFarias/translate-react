import { mock } from "bun:test";
import OpenAI from "openai";

import type { ChatCompletion } from "openai/resources.mjs";

import type { RateLimiter } from "@/services/";

/**
 * Creates a mock ChatCompletion response.
 *
 * @param content The translated content to return
 * @param options Additional response options
 *
 * @returns Mock ChatCompletion object
 */
export function createMockChatCompletion(
	content: string,
	options?: {
		id?: string;
		model?: string;
		totalTokens?: number;
	},
): ChatCompletion {
	return {
		id: options?.id ?? "chatcmpl-test-123",
		created: Date.now(),
		model: options?.model ?? "test-model",
		object: "chat.completion",
		choices: [
			{
				message: {
					content,
					refusal: null,
					role: "assistant",
				},
				finish_reason: "stop",
				index: 0,
				logprobs: null,
			},
		],
		usage: {
			total_tokens: options?.totalTokens ?? 50,
			completion_tokens: 30,
			prompt_tokens: 20,
		},
	} as ChatCompletion;
}

/** Factory for creating chat completions mock function */
export function createChatCompletionsMock(defaultResponse?: ChatCompletion) {
	return mock(() => Promise.resolve(defaultResponse ?? createMockChatCompletion("Olá mundo")));
}

/**
 * Creates a mock OpenAI client instance for testing.
 *
 * @param chatCompletionsCreate Optional mock for chat.completions.create
 *
 * @returns Type-safe mock OpenAI instance
 *
 * @example
 * ```typescript
 * const openai = createMockOpenAI();
 *
 * // Or with custom response
 * const openai = createMockOpenAI(
 *   mock(() => Promise.resolve(createMockChatCompletion("Custom response")))
 * );
 * ```
 */
export function createMockOpenAI(
	chatCompletionsCreate?: ReturnType<typeof createChatCompletionsMock>,
): OpenAI {
	return {
		chat: {
			completions: {
				create: chatCompletionsCreate ?? createChatCompletionsMock(),
			},
		},
	} as unknown as OpenAI;
}

/**
 * Creates a mock RateLimiter that executes functions immediately.
 *
 * Useful for testing without rate limiting delays.
 *
 * @returns Mock RateLimiter instance
 */
export function createMockRateLimiter(): RateLimiter {
	return {
		schedule: <T>(fn: () => Promise<T>) => fn(),
		metrics: () => ({
			queued: 0,
			running: 0,
			done: 0,
			failed: 0,
		}),
	} as unknown as RateLimiter;
}
