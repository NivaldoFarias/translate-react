import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AbortError } from "p-retry";

import type { ChunksManager } from "@/app/services/translator/chunking";
import type { TranslationLlmClient } from "@/app/services/translator/llm/translation-llm.client";

import { LegacyBodyTranslationService } from "@/app/services/translator/legacy/legacy-body-translation.service";
import { createTranslationFileContext } from "@/app/services/translator/translation-file-context";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

import { createTranslationFileFixture } from "@tests/fixtures";

function createTruncationError() {
	return new AbortError(
		new ApplicationError(
			"Language model response ended at max completion tokens (truncated output)",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModel",
		),
	);
}

function createTestLegacyService(options?: {
	llmResponses?: (string | Error)[];
	initialChunks?: string[];
	rechunkResult?: { chunks: string[]; separators: string[] };
}) {
	let llmCallIndex = 0;
	const llmResponses = options?.llmResponses ?? ["translated-body"];

	const callLanguageModel = mock(() => {
		const response = llmResponses[llmCallIndex];
		llmCallIndex += 1;

		if (response instanceof Error) {
			return Promise.reject(response);
		}

		return Promise.resolve({ content: response, usage: null });
	});
	const needsChunking = mock(() => true);
	const chunkContent = mock((_content: string, budget?: number) => {
		if (budget !== undefined) {
			return Promise.resolve(
				options?.rechunkResult ?? {
					chunks: ["sub-a", "sub-b"],
					separators: [""],
				},
			);
		}

		return Promise.resolve({
			chunks: options?.initialChunks ?? ["large-chunk"],
			separators: [] as string[],
		});
	});
	const estimateTokenCount = mock(() => 100);
	const getMarkdownChunkSplitterTokenBudget = mock(() => 4_096);

	const llmClient = { callLanguageModel } as unknown as TranslationLlmClient;
	const chunksManager = {
		needsChunking,
		chunkContent,
		estimateTokenCount,
		getMarkdownChunkSplitterTokenBudget,
	} as unknown as ChunksManager;

	return {
		service: new LegacyBodyTranslationService({ chunksManager, llmClient }),
		callLanguageModel,
		needsChunking,
		chunkContent,
	};
}

describe("LegacyBodyTranslationService", () => {
	beforeEach(() => {
		mock.restore();
	});

	test("re-chunks and translates sub-chunks when a chunk hits the completion token limit", async () => {
		const { service, callLanguageModel, chunkContent } = createTestLegacyService({
			llmResponses: [createTruncationError(), "part-a", "part-b"],
		});

		const file = createTranslationFileFixture({
			content: "Large markdown body for legacy chunking.",
		});
		const fileContext = createTranslationFileContext();

		const result = await service.translateMarkdownBodyLegacy(file, undefined, fileContext);

		expect(result).toBe("part-apart-b");
		expect(chunkContent).toHaveBeenCalledWith("large-chunk", expect.any(Number));
		expect(callLanguageModel).toHaveBeenCalledTimes(3);
		expect(fileContext.translationPath).toBe("legacy-chunked");
	});

	test("falls back to chunked translation when full-body translation truncates", async () => {
		const { service, callLanguageModel, needsChunking } = createTestLegacyService({
			llmResponses: [createTruncationError(), "chunk-one"],
		});

		needsChunking.mockReturnValue(false);

		const file = createTranslationFileFixture({
			content: "Body that fits one request but truncates.",
		});
		const fileContext = createTranslationFileContext();

		const result = await service.translateMarkdownBodyLegacy(file, undefined, fileContext);

		expect(result).toBe("chunk-one");
		expect(needsChunking).toHaveBeenCalled();
		expect(callLanguageModel).toHaveBeenCalledTimes(2);
		expect(fileContext.translationPath).toBe("legacy-chunked");
	});
});
