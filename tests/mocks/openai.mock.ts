import { mock } from "bun:test";

import type { ChatCompletion } from "openai/resources.mjs";
import type { PartialDeep } from "type-fest";

/**
 * Creates a mock ChatCompletion response.
 *
 * @param overrides Optional overrides for the ChatCompletion fields
 *
 * @returns Mock ChatCompletion object
 */
export function createMockChatCompletion(overrides?: PartialDeep<ChatCompletion>): ChatCompletion {
	return {
		id: "chatcmpl-test-123",
		created: Date.now(),
		model: "test-model",
		object: "chat.completion",
		choices: [
			{
				message: {
					content: "",
					refusal: null,
					role: "assistant",
				},
				finish_reason: "stop",
				index: 0,
				logprobs: null,
			},
		],
		usage: {
			total_tokens: 50,
			completion_tokens: 30,
			prompt_tokens: 20,
		},
		...overrides,
	} as ChatCompletion;
}

/** Factory for creating chat completions mock function */
export function createChatCompletionsMock(defaultResponse?: ChatCompletion) {
	return mock(() =>
		Promise.resolve(
			defaultResponse ??
				createMockChatCompletion({
					choices: [
						{
							message: {
								content: "Olá mundo",
								refusal: null,
								role: "assistant",
							},
							finish_reason: "length",
							index: 0,
							logprobs: null,
						},
					],
				}),
		),
	);
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
