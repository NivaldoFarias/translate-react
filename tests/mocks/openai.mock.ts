import { mock } from "bun:test";

import type { ChatCompletion } from "openai/resources.mjs";

import { createChatCompletionFixture } from "@tests/fixtures";

/** Factory for creating chat completions mock function */
export function createChatCompletionsMock(defaultResponse?: ChatCompletion) {
	return mock(() => Promise.resolve(defaultResponse ?? createChatCompletionFixture()));
}

/**
 * Creates a mock OpenAI client instance for testing.
 *
 * @param chatCompletionsCreate Optional mock for chat.completions.create
 *
 * @returns Properly-typed mock OpenAI instance ready for service injection
 *
 * @example
 * ```typescript
 * const openai = createMockOpenAI();
 *
 * // With custom response
 * const openai = createMockOpenAI(
 *   mock(() => Promise.resolve(createMockChatCompletion("Custom response")))
 * );
 * ```
 */
export function createMockOpenAI(
	chatCompletionsCreate?: ReturnType<typeof createChatCompletionsMock>,
) {
	return {
		chat: {
			completions: {
				create: chatCompletionsCreate ?? createChatCompletionsMock(),
			},
		},
	};
}

/**
 * Creates a mock RateLimiter that executes functions immediately.
 *
 * @returns Properly-typed mock RateLimiter instance
 */
export function createMockRateLimiter() {
	return {
		schedule: <T>(fn: () => Promise<T>) => fn(),
		metrics: () => ({
			queued: 0,
			running: 0,
			done: 0,
			failed: 0,
		}),
	};
}
