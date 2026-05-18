import { mock } from "bun:test";

import type OpenAI from "openai";

import { frontmatterBatchRequestEnvelopeSchema } from "@/services/translator/translator-frontmatter-batch.schema";

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

/**
 * When the user message is a frontmatter batch request JSON, builds a valid structured response
 * by echoing each `source` string into `translated` so integration tests behave like a no-op model.
 *
 * @param userContent Raw user message string from the chat request
 *
 * @returns JSON string for `choices[0].message.content`, or `null` when the payload is not a batch request
 */
function passthroughFrontmatterBatchResponse(userContent: string) {
	try {
		const parsed = frontmatterBatchRequestEnvelopeSchema.safeParse(JSON.parse(userContent));
		if (!parsed.success) return null;

		const items = parsed.data.items.map((item) => ({
			fieldKey: item.fieldKey,
			translated: item.source,
		}));

		return JSON.stringify({ items });
	} catch {
		return null;
	}
}

/** Echoes the last user message as assistant content; maps `ping` → `pong` for connectivity checks */
export function createPassthroughChatCompletionsMock() {
	return mock((params: OpenAI.Chat.Completions.ChatCompletionCreateParams) => {
		const userContent = getLastUserText(params.messages);

		const batchResponse = passthroughFrontmatterBatchResponse(userContent);
		if (batchResponse !== null) {
			return Promise.resolve(createChatCompletionFixture(batchResponse));
		}

		const outbound =
			userContent === "ping" ? "pong"
			: userContent.length > 0 ? userContent
			: ".";

		return Promise.resolve(createChatCompletionFixture(outbound));
	});
}
