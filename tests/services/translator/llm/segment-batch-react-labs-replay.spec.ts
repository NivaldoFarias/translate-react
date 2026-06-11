import { beforeEach, describe, expect, test } from "bun:test";

import type { TranslationLlmClientDependencies } from "@/app/services/translator/llm/translation-llm.client.types";

import { localeService } from "@/app/composition";
import { TranslationLlmClient } from "@/app/services/translator/llm/translation-llm.client";
import { TranslationPromptBuilder } from "@/app/services/translator/llm/translation-prompt.builder";

import {
	createChatCompletionFixture,
	createSegmentBatchLlmJsonContent,
	createTranslationFileFixture,
} from "@tests/fixtures";
import {
	createChatCompletionsMock,
	createMockLanguageDetectorService,
	createMockOpenAI,
	createMockQueue,
} from "@tests/mocks";

const REACT_LABS_SWAP_REAL_IDS = {
	missing: "root/mdxJsxFlowElement[97]/paragraph[0]/strong[0]/text[1]#0",
	extra: "root/mdxJsxFlowElement[97]/paragraph[0]/strong[0]/text[0]#0",
} as const;

const mockChatCompletionsCreate = createChatCompletionsMock();

function createReplayLlmClient() {
	const languageDetector = createMockLanguageDetectorService();
	const promptBuilder = new TranslationPromptBuilder(
		languageDetector as unknown as ConstructorParameters<typeof TranslationPromptBuilder>[0],
		localeService,
	);

	return new TranslationLlmClient({
		openai: createMockOpenAI(mockChatCompletionsCreate),
		model: "test-model",
		queue: createMockQueue(),
		retryConfig: { retries: 0, factor: 1, minTimeout: 1, maxTimeout: 10, randomize: false },
		promptBuilder,
		estimateInputTokens: (content: string) => Math.ceil(content.length / 4),
		getCompletionTokenCap: () => 4_096,
		resolveDocumentSourceLanguage: () => Promise.resolve("en"),
		getTranslationGuidelines: () => null,
	} as unknown as TranslationLlmClientDependencies);
}

describe("react-labs segment batch replay", () => {
	beforeEach(() => {
		mockChatCompletionsCreate.mockClear();
	});

	test("opaque ids prevent adjacent mdast text index swaps from failing validation", async () => {
		mockChatCompletionsCreate.mockImplementation((params: unknown) => {
			const body = params as {
				messages?: { role: string; content?: string }[];
			};
			const userContent = body.messages?.find((message) => message.role === "user")?.content ?? "";
			const payload = JSON.parse(userContent) as {
				items: { segmentId: string; source: string }[];
			};

			return Promise.resolve(
				createChatCompletionFixture(
					createSegmentBatchLlmJsonContent(
						payload.items.map((item) => ({
							segmentId: item.segmentId,
							translated: `${item.source}-pt`,
						})),
					),
				),
			);
		});

		const llmClient = createReplayLlmClient();
		const file = createTranslationFileFixture({ content: "# Labs\n\nReact Labs" });
		const batchItems = [
			{
				segmentId: REACT_LABS_SWAP_REAL_IDS.extra,
				source: "first",
			},
			{
				segmentId: REACT_LABS_SWAP_REAL_IDS.missing,
				source: "second",
			},
		];

		const { envelope } = await llmClient.callLanguageModelSegmentBatch(file, batchItems);

		expect(envelope.items).toEqual([
			{ segmentId: REACT_LABS_SWAP_REAL_IDS.extra, translated: "first-pt" },
			{ segmentId: REACT_LABS_SWAP_REAL_IDS.missing, translated: "second-pt" },
		]);

		const firstCallParams = mockChatCompletionsCreate.mock.calls[0]?.[0] as {
			messages?: { role: string; content?: string }[];
		};
		const userContent =
			firstCallParams.messages?.find((message) => message.role === "user")?.content ?? "{}";
		const sentPayload = JSON.parse(userContent) as { items: { segmentId: string }[] };

		expect(sentPayload.items.map((item) => item.segmentId)).toEqual(["s0", "s1"]);
	});
});
