import OpenAI from "openai";

import type { ChunksManager } from "../chunking";
import type { TranslationLlmClient } from "../llm/translation-llm.client";
import type { TranslationLlmUsageSnapshot } from "../llm/translation-llm.usage";
import type {
	ChunkTranslationProgress,
	TranslationSystemPromptKind,
} from "../llm/translation-system-prompt.types";
import type { TranslationAttemptContext } from "../pipeline/translation-attempt.context";
import type { TranslationFile } from "../translation-file";
import type { TranslationFileContext } from "../translation-file-context";

import { isCompletionLengthTruncationError } from "@/shared/errors/";

import { mergeTranslationLlmUsage } from "../llm/translation-llm.usage";
import { stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences } from "../markdown/artifacts";
import { emptyTranslationAttemptContext } from "../pipeline/translation-attempt.context";
import { validateAndReassembleChunks } from "../postprocess/chunk-reassembly";

/** Dependency injection interface for {@link LegacyBodyTranslationService} */
export interface LegacyBodyTranslationServiceDependencies {
	/** Token-budget chunk splitter for oversized markdown bodies */
	chunksManager: ChunksManager;

	/** OpenAI chat completion transport with retries and rate limiting */
	llmClient: TranslationLlmClient;
}

/**
 * Full-document and chunked markdown body translation (legacy fallback path).
 *
 * Used when segment extraction is unsafe or segment batch translation cannot recover.
 */
export class LegacyBodyTranslationService {
	/** Reduction factor for re-chunking when a chunk hits completion token limits */
	private static readonly RECHUNK_BUDGET_FACTOR = 0.5;

	private readonly chunksManager: ChunksManager;

	private readonly llmClient: TranslationLlmClient;

	/**
	 * Creates a legacy body translation service with injected chunking and LLM clients.
	 *
	 * @param dependencies Chunk manager and LLM transport
	 */
	constructor(dependencies: LegacyBodyTranslationServiceDependencies) {
		this.chunksManager = dependencies.chunksManager;
		this.llmClient = dependencies.llmClient;
	}

	/**
	 * Translates markdown body via full-document or chunked LLM calls (fallback path).
	 *
	 * Used when segment extraction is unsafe or segment batch translation fails.
	 *
	 * @param file Work file whose `content` is the body sent to the LLM
	 * @param attemptContext Reserved per-attempt metadata for the system prompt (currently empty)
	 * @param fileContext Per-call translation state for the active file
	 *
	 * @returns Translated markdown body before frontmatter merge
	 */
	public async translateMarkdownBodyLegacy(
		file: TranslationFile,
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
		fileContext: TranslationFileContext,
	): Promise<string> {
		const contentNeedsChunking = this.chunksManager.needsChunking(file);
		if (contentNeedsChunking) {
			return this.translateWithChunking(file, attemptContext, fileContext);
		}

		fileContext.translationPath = "legacy-full-body";

		try {
			return await this.callLanguageModel(
				file,
				undefined,
				undefined,
				"markdownDocument",
				undefined,
				attemptContext,
				fileContext,
			);
		} catch (error) {
			if (!isCompletionLengthTruncationError(error)) {
				throw error;
			}

			file.logger.info(
				{ path: file.path, contentLength: file.content.length },
				"Completion token limit reached; translating in chunks",
			);
			return this.translateWithChunking(file, attemptContext, fileContext);
		}
	}

	/**
	 * Translates an oversized body by splitting with {@link ChunksManager} and reassembling chunks.
	 *
	 * Legacy fallback used when {@link translateMarkdownBodyLegacy} needs token-budget chunking.
	 *
	 * @param file Work file whose `content` is the markdown body
	 * @param attemptContext Reserved per-attempt metadata for the system prompt (currently empty)
	 * @param fileContext Per-call translation state for the active file
	 *
	 * @returns Translated body reassembled from all chunks
	 *
	 * @see {@link ChunksManager.chunkContent} for chunking strategy details
	 */
	private async translateWithChunking(
		file: TranslationFile,
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
		fileContext: TranslationFileContext,
	): Promise<string> {
		fileContext.translationPath = "legacy-chunked";
		file.logger.debug({ contentLength: file.content.length }, "Starting chunked translation");

		const { chunks, separators } = await this.chunksManager.chunkContent(file.content);

		file.logger.debug(
			{
				chunkCount: chunks.length,
				chunkSizes: chunks.map((c) => c.length),
				separatorCount: separators.length,
			},
			"Content split into chunks",
		);

		const translatedChunks = await Promise.all(
			chunks.map((chunk, index) =>
				this.translateChunk(file, chunk, index, chunks, attemptContext, fileContext),
			),
		);

		file.logger.debug(
			{ translatedChunkCount: translatedChunks.length },
			"All chunks translated, reassembling",
		);

		return validateAndReassembleChunks(file, {
			original: chunks,
			translated: translatedChunks,
			separators,
		});
	}

	/**
	 * Translates a single markdown chunk using the full-document LLM prompt.
	 *
	 * When the LLM truncates output due to completion token limits, the chunk is
	 * automatically split into smaller sub-chunks and translated recursively.
	 *
	 * @param file File instance for logger context
	 * @param chunk Content to translate
	 * @param index Index of the chunk
	 * @param chunks Array of all chunks
	 * @param attemptContext Reserved per-attempt metadata for the system prompt (currently empty)
	 * @param fileContext Per-call translation state for the active file
	 * @param tokenBudget Maximum tokens per sub-chunk (used during recursive re-chunking)
	 *
	 * @returns Promise resolving to the translated chunk
	 */
	private async translateChunk(
		file: TranslationFile,
		chunk: string,
		index: number,
		chunks: string[],
		attemptContext: TranslationAttemptContext = emptyTranslationAttemptContext(),
		fileContext: TranslationFileContext,
		tokenBudget?: number,
	): Promise<string> {
		const startTime = Date.now();
		const estimatedTokens = this.chunksManager.estimateTokenCount(chunk);

		file.logger.debug(
			{
				chunkIndex: index + 1,
				totalChunks: chunks.length,
				chunkSize: chunk.length,
				estimatedTokens,
				tokenBudget,
			},
			`Translating chunk ${index + 1}/${chunks.length}`,
		);

		const chunkProgress: ChunkTranslationProgress | undefined =
			chunks.length > 1 ? { index: index + 1, total: chunks.length } : undefined;

		try {
			const translatedChunk = await this.callLanguageModel(
				file,
				chunk,
				chunkProgress,
				"markdownDocument",
				undefined,
				attemptContext,
				fileContext,
			);

			const strippedChunk = stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(
				chunk,
				translatedChunk,
				file.logger,
			);

			file.logger.debug(
				{
					chunkIndex: index + 1,
					totalChunks: chunks.length,
					originalSize: chunk.length,
					translatedSize: strippedChunk.length,
					durationMs: Date.now() - startTime,
				},
				`Chunk ${index + 1}/${chunks.length} translation complete`,
			);

			return strippedChunk;
		} catch (error) {
			if (!isCompletionLengthTruncationError(error)) {
				throw error;
			}

			return this.handleChunkTruncation(
				file,
				chunk,
				index,
				chunks,
				attemptContext,
				fileContext,
				tokenBudget,
			);
		}
	}

	/**
	 * Handles chunk truncation by re-chunking with a reduced token budget and translating recursively.
	 *
	 * @param file File instance for logger context
	 * @param chunk The chunk that was truncated
	 * @param index Index of the chunk in the parent array
	 * @param chunks Parent chunk array
	 * @param attemptContext Reserved per-attempt metadata for the system prompt (currently empty)
	 * @param fileContext Per-call translation state for the active file
	 * @param currentBudget Current token budget (if already in a re-chunk pass)
	 *
	 * @returns Translated content assembled from sub-chunks
	 */
	private async handleChunkTruncation(
		file: TranslationFile,
		chunk: string,
		index: number,
		chunks: string[],
		attemptContext: TranslationAttemptContext,
		fileContext: TranslationFileContext,
		currentBudget?: number,
	): Promise<string> {
		const baseBudget = currentBudget ?? this.chunksManager.getMarkdownChunkSplitterTokenBudget();
		const reducedBudget = Math.max(
			256,
			Math.floor(baseBudget * LegacyBodyTranslationService.RECHUNK_BUDGET_FACTOR),
		);

		file.logger.info(
			{
				chunkIndex: index + 1,
				totalChunks: chunks.length,
				chunkLength: chunk.length,
				baseBudget,
				reducedBudget,
			},
			"Chunk hit completion token limit; re-chunking with reduced budget",
		);

		const { chunks: subChunks, separators } = await this.chunksManager.chunkContent(
			chunk,
			reducedBudget,
		);

		if (subChunks.length <= 1) {
			file.logger.warn(
				{ chunkIndex: index + 1, reducedBudget },
				"Re-chunking produced single chunk; content may still truncate",
			);
		}

		file.logger.debug(
			{ subChunkCount: subChunks.length, reducedBudget },
			"Re-chunking complete; translating sub-chunks",
		);

		const translatedSubChunks = await Promise.all(
			subChunks.map((subChunk, subIndex) =>
				this.translateChunk(
					file,
					subChunk,
					subIndex,
					subChunks,
					attemptContext,
					fileContext,
					reducedBudget,
				),
			),
		);

		return validateAndReassembleChunks(file, {
			original: subChunks,
			translated: translatedSubChunks,
			separators,
		});
	}

	/**
	 * Delegates a single LLM translation call to {@link TranslationLlmClient.callLanguageModel}.
	 *
	 * @param file File under translation (logging and prompt context)
	 * @param content Optional markdown slice; defaults to `file.content`
	 * @param chunkProgress Slice index when translating a chunked document
	 * @param systemPromptKind Markdown body vs frontmatter batch prompt
	 * @param responseFormat Optional structured output format for the completion
	 * @param attemptContext Reserved per-attempt metadata for the system prompt (currently empty)
	 * @param fileContext Per-call translation state for the active file
	 *
	 * @returns LLM completion text from the shared client
	 *
	 * @see {@link TranslationLlmClient.callLanguageModel}
	 */
	private async callLanguageModel(
		file: TranslationFile,
		content: string | undefined,
		chunkProgress: ChunkTranslationProgress | undefined,
		systemPromptKind: TranslationSystemPromptKind,
		responseFormat:
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["response_format"]
			| undefined,
		attemptContext: TranslationAttemptContext,
		fileContext: TranslationFileContext,
	): Promise<string> {
		const result = await this.llmClient.callLanguageModel(
			file,
			content,
			chunkProgress,
			systemPromptKind,
			responseFormat,
			attemptContext,
		);
		this.recordLlmUsage(fileContext, result.usage);
		return result.content;
	}

	/**
	 * Adds one completion's usage into the per-file accumulator for legacy translation.
	 *
	 * @param fileContext Per-call translation state for the active file
	 * @param usage Token and cost snapshot from an LLM call, if reported
	 */
	private recordLlmUsage(
		fileContext: TranslationFileContext,
		usage: TranslationLlmUsageSnapshot | null,
	): void {
		fileContext.llmUsage = mergeTranslationLlmUsage(fileContext.llmUsage, usage);
	}
}
