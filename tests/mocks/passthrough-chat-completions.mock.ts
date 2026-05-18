import { mock } from "bun:test";

import type OpenAI from "openai";

import { createChatCompletionFixture } from "@tests/fixtures";

/**
 * Returns the last user message content, or empty string if no user messages are found.
 *
 * @param messages The messages to search through
 *
 * @returns The last user message content, or empty string if no user messages are found
 */
function getLastUserText(messages: OpenAI.Chat.Completions.ChatCompletionCreateParams["messages"]) {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role === "user" && typeof message.content === "string") {
			return message.content;
		}
	}

	return "";
}

/** Echoes the last user message as assistant content; maps `ping` → `pong` for connectivity checks */
export function createPassthroughChatCompletionsMock() {
	return mock((params: OpenAI.Chat.Completions.ChatCompletionCreateParams) => {
		const userContent = getLastUserText(params.messages);
		const outbound =
			userContent === "ping" ? "pong"
			: userContent.length > 0 ? userContent
			: ".";

		return Promise.resolve(createChatCompletionFixture(outbound));
	});
}
