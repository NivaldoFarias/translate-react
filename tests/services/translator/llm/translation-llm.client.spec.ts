import { beforeEach, describe, expect, test } from "bun:test";

import type { TranslationLlmClientDependencies } from "@/app/services/translator/llm/translation-llm.client.types";

import { localeService } from "@/app/composition";
import { TranslationLlmClient } from "@/app/services/translator/llm/translation-llm.client";
import { TranslationPromptBuilder } from "@/app/services/translator/llm/translation-prompt.builder";
import { ApplicationError, ErrorCode, isCompletionLengthTruncationError } from "@/shared/errors/";

import {
	createChatCompletionFixture,
	createFrontmatterBatchLlmJsonContent,
	createTranslationFileFixture,
} from "@tests/fixtures";
import {
	createChatCompletionsMock,
	createMockLanguageDetectorService,
	createMockOpenAI,
	createMockQueue,
} from "@tests/mocks";

const mockChatCompletionsCreate = createChatCompletionsMock();

function createTestLlmClient(overrides?: { retries?: number }) {
	const languageDetector = createMockLanguageDetectorService();
	const promptBuilder = new TranslationPromptBuilder(
		languageDetector as unknown as ConstructorParameters<typeof TranslationPromptBuilder>[0],
		localeService,
	);

	return new TranslationLlmClient({
		openai: createMockOpenAI(mockChatCompletionsCreate),
		model: "test-model",
		queue: createMockQueue(),
		retryConfig: {
			retries: overrides?.retries ?? 0,
			factor: 1,
			minTimeout: 1,
			maxTimeout: 10,
			randomize: false,
		},
		promptBuilder,
		estimateInputTokens: (content: string) => Math.ceil(content.length / 4),
		getCompletionTokenCap: () => 4_096,
		resolveDocumentSourceLanguage: () => Promise.resolve("en"),
		getTranslationGuidelines: () => null,
	} as unknown as TranslationLlmClientDependencies);
}

describe("TranslationLlmClient", () => {
	let llmClient: TranslationLlmClient;

	beforeEach(() => {
		mockChatCompletionsCreate.mockClear();
		llmClient = createTestLlmClient();
	});

	describe("isLLMResponseValid", () => {
		test("returns false when completion has no id or usage", () => {
			const invalid = createChatCompletionFixture({
				id: undefined,
				usage: undefined,
				choices: [],
			});

			expect(llmClient.isLLMResponseValid(invalid)).toBe(false);
		});
	});

	describe("callLanguageModel", () => {
		test("surfaces finish_reason length as completion truncation error", async () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [
						{
							message: { content: "partial", refusal: null, role: "assistant" },
							finish_reason: "length",
							index: 0,
							logprobs: null,
						},
					],
				}),
			);

			const file = createTranslationFileFixture({ content: "Hello world" });

			try {
				await llmClient.callLanguageModel(file);
				throw new Error("expected rejection");
			} catch (error) {
				expect(isCompletionLengthTruncationError(error)).toBe(true);
			}
		});

		test("retries once then returns translated content", async () => {
			let attempt = 0;
			mockChatCompletionsCreate.mockImplementation(() => {
				attempt += 1;
				if (attempt === 1) {
					return Promise.reject(new Error("transient failure"));
				}
				return Promise.resolve(createChatCompletionFixture("Olá mundo"));
			});

			const file = createTranslationFileFixture({ content: "Hello world" });
			const clientWithRetry = createTestLlmClient({ retries: 1 });

			const translated = await clientWithRetry.callLanguageModel(file);

			expect(translated.content).toBe("Olá mundo");
			expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(2);
		});

		test("throws ApplicationError when model returns empty content", () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [{ message: { content: null } }],
				}),
			);

			const file = createTranslationFileFixture({ content: "Hello world" });

			expect(llmClient.callLanguageModel(file)).rejects.toThrow(ApplicationError);
		});
	});

	describe("callLanguageModelFrontmatterBatch", () => {
		test("throws ApplicationError when finish_reason is length", () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture({
					choices: [
						{
							message: {
								content: createFrontmatterBatchLlmJsonContent("Bem-vindo"),
								refusal: null,
								role: "assistant",
							},
							finish_reason: "length",
							index: 0,
							logprobs: null,
						},
					],
				}),
			);

			const file = createTranslationFileFixture({
				content: "---\ndescription: Welcome\n---\n\n# Hi",
			});

			expect(
				llmClient.callLanguageModelFrontmatterBatch(file, [
					{ fieldKey: "description", source: "Welcome" },
				]),
			).rejects.toThrow("truncated frontmatter batch JSON");
		});

		test("returns parsed envelope for valid structured JSON", async () => {
			mockChatCompletionsCreate.mockResolvedValue(
				createChatCompletionFixture(createFrontmatterBatchLlmJsonContent("Bem-vindo")),
			);

			const file = createTranslationFileFixture({
				content: "---\ndescription: Welcome\n---\n\n# Hi",
			});

			const { envelope } = await llmClient.callLanguageModelFrontmatterBatch(file, [
				{ fieldKey: "description", source: "Welcome" },
			]);

			expect(envelope.items[0]?.translated).toBe("Bem-vindo");
		});

		test("maps invalid JSON to ApplicationError with TranslationFailed code", async () => {
			mockChatCompletionsCreate.mockResolvedValue(createChatCompletionFixture("not-json"));

			const file = createTranslationFileFixture({
				content: "---\ndescription: Welcome\n---\n\n# Hi",
			});

			try {
				await llmClient.callLanguageModelFrontmatterBatch(file, [
					{ fieldKey: "description", source: "Welcome" },
				]);
				throw new Error("expected rejection");
			} catch (error) {
				expect(error).toBeInstanceOf(ApplicationError);
				if (error instanceof ApplicationError) {
					expect(error.code).toBe(ErrorCode.TranslationFailed);
				}
			}
		});
	});
});
