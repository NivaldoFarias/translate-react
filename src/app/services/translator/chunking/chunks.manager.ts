import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { encodingForModel } from "js-tiktoken";

import type { MarkdownTextSplitterParams } from "@langchain/textsplitters";
import type { Tiktoken, TiktokenModel } from "js-tiktoken";

import type { TranslationFile } from "../translation-file";

import { env, logger } from "@/app/utils";
import { ApplicationError, ErrorCode } from "@/shared/errors";

import { TranslatorService } from "../translator.service";

import {
	CHUNK_OUTPUT_COMPLETION_RESERVE,
	CHUNKS,
	DEFAULT_TIKTOKEN_MODEL,
	SUPPORTED_TIKTOKEN_MODELS,
	SYSTEM_PROMPT_TOKEN_RESERVE,
	TOKEN_ESTIMATION_FALLBACK_DIVISOR,
	TRANSLATION_OUTPUT_TO_INPUT_TOKEN_RATIO,
} from "./chunking.constants";

/**
 * Result of content chunking operation containing chunks and their separators.
 *
 * The separators array contains the exact whitespace patterns that existed
 * between each pair of chunks in the original content, enabling perfect
 * reassembly that preserves the source formatting.
 */
export interface ChunkingResult {
	/** Array of content chunks split from the original text */
	chunks: string[];

	/**
	 * Array of separator strings between chunks.
	 *
	 * Length is always `chunks.length - 1` since there's one separator
	 * between each pair of adjacent chunks. Each separator is the exact
	 * whitespace pattern (e.g., `\n`, `\n\n`, `\n\n\n`) extracted from
	 * the original content at that boundary position.
	 */
	separators: string[];
}

/** Type representing a collection of chunks and their separators for reassembly. */
export type ChunksToReassemble = Omit<ChunkingResult, "chunks"> & {
	/** Array of original content chunks */
	original: string[];

	/** Array of translated content chunks */
	translated: string[];
};

export class ChunksManager {
	private readonly logger = logger.child({ component: ChunksManager.name });

	private readonly model: string;

	private readonly maxGrossChunkInputTokens: number;

	/**
	 * Provider `max_tokens` / completion cap for one assistant message; used to cap chunk **input**
	 * so a single translation call is less likely to exceed available completion budget.
	 */
	private readonly maxCompletionTokensPerResponse: number;

	/**
	 * @param model LLM model id (used for tiktoken profile selection)
	 * @param maxGrossChunkInputTokens Upper bound on estimated input tokens per chunk (same role as {@link CHUNKS.maxTokens})
	 * @param maxCompletionTokensPerResponse Completion token cap for one chat completion (defaults to {@link env.MAX_TOKENS})
	 */
	constructor(
		model: string,
		maxGrossChunkInputTokens: number = CHUNKS.maxTokens,
		maxCompletionTokensPerResponse: number = env.MAX_TOKENS,
	) {
		this.model = model;
		this.maxGrossChunkInputTokens = maxGrossChunkInputTokens;
		this.maxCompletionTokensPerResponse = maxCompletionTokensPerResponse;
	}

	/**
	 * Maximum estimated **source** tokens per markdown chunk so the model can usually finish
	 * within {@link maxCompletionTokensPerResponse} completion tokens.
	 *
	 * @returns Token budget derived from completion cap and output-to-input ratio
	 */
	public getMaxChunkInputTokensFromCompletionCap(): number {
		const budget = Math.max(
			512,
			this.maxCompletionTokensPerResponse - CHUNK_OUTPUT_COMPLETION_RESERVE,
		);

		return Math.max(256, Math.floor(budget / TRANSLATION_OUTPUT_TO_INPUT_TOKEN_RATIO));
	}

	/**
	 * Effective `chunkSize` passed to {@link MarkdownTextSplitter}: limited by both context budget
	 * and completion-token budget for translation output.
	 *
	 * @returns Minimum of context-window and completion-derived chunk token limits
	 */
	public getMarkdownChunkSplitterTokenBudget(): number {
		const fromContext = this.maxGrossChunkInputTokens - CHUNKS.tokenBuffer;
		const fromCompletion = this.getMaxChunkInputTokensFromCompletionCap();

		return Math.max(256, Math.min(fromContext, fromCompletion));
	}

	/** Lazily-initialized tiktoken encoder instance, cached for performance */
	private cachedEncoder: Tiktoken | null = null;

	/**
	 * Gets or creates a cached tiktoken encoder instance.
	 *
	 * The encoder is expensive to create (~500ms) due to vocabulary loading
	 * and regex compilation, so we cache it for reuse across all token
	 * estimation calls.
	 *
	 * @returns Cached `Tiktoken` encoder for the configured model
	 */
	private get encoder(): Tiktoken {
		const tiktokenModel = this.getTiktokenModel(this.model);
		this.cachedEncoder ??= encodingForModel(tiktokenModel);

		return this.cachedEncoder;
	}

	/** Tracks whether the configured model uses tiktoken fallback (non-OpenAI model) */
	private usesTiktokenFallback: boolean | null = null;

	/**
	 * Maps the configured LLM model to a compatible `tiktoken` model for token counting.
	 *
	 * Since `tiktoken` only supports OpenAI models, non-OpenAI models (e.g., Gemini)
	 * are mapped to a compatible fallback model. The token counts will be approximate
	 * but sufficient for chunking purposes.
	 *
	 * @param model The configured LLM model identifier
	 *
	 * @returns A compatible `tiktoken` model identifier
	 */
	public getTiktokenModel(model: string): TiktokenModel {
		const supportedModel = SUPPORTED_TIKTOKEN_MODELS.find((supportedModel) =>
			model.includes(supportedModel),
		);

		if (supportedModel) {
			this.usesTiktokenFallback = false;
			return supportedModel;
		}

		if (this.usesTiktokenFallback === null) {
			this.logger.warn(
				{ model, fallback: DEFAULT_TIKTOKEN_MODEL },
				"Model not supported by tiktoken; using fallback with 20% safety margin for token estimates",
			);
		}

		this.usesTiktokenFallback = true;
		return DEFAULT_TIKTOKEN_MODEL;
	}

	/** Safety margin multiplier applied when using tiktoken fallback model */
	private static readonly TIKTOKEN_FALLBACK_SAFETY_MARGIN = 1.2;

	/**
	 * Estimates token count for content using tiktoken encoding.
	 *
	 * Uses the actual tokenization model to provide accurate token counts
	 * for the specific LLM being used. Required for proper chunking
	 * and avoiding API limits.
	 *
	 * When the configured model has no direct tiktoken support (e.g., Gemini),
	 * a 20% safety margin is applied to account for tokenizer differences.
	 *
	 * @param content Content to estimate tokens for
	 *
	 * @returns Token count using model-specific encoding (with safety margin if using fallback)
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const tokenCount = translator.estimateTokenCount('# Hello World\n\nWelcome!');
	 * console.log(tokenCount); // ~8 tokens (or ~10 with fallback safety margin)
	 * ```
	 */
	public estimateTokenCount(content: string): number {
		try {
			const tokens = this.encoder.encode(content);
			const baseCount = tokens.length;

			if (this.usesTiktokenFallback) {
				return Math.ceil(baseCount * ChunksManager.TIKTOKEN_FALLBACK_SAFETY_MARGIN);
			}

			return baseCount;
		} catch (error) {
			const fallback = Math.ceil(content.length / TOKEN_ESTIMATION_FALLBACK_DIVISOR);
			this.logger.error({ error }, "Error estimating token count, using fallback");

			return fallback;
		}
	}

	/**
	 * Determines if content needs chunking based on token estimates.
	 *
	 * Chunking is required when the body exceeds either the configured **context** budget
	 * (`maxGrossChunkInputTokens - SYSTEM_PROMPT_TOKEN_RESERVE`) or the **completion** budget
	 * derived from {@link maxCompletionTokensPerResponse} so a single-shot translation is unlikely
	 * to hit `max_tokens` mid-document.
	 *
	 * @param file Translation file whose `content` is measured against token budgets
	 *
	 * @returns `true` when content exceeds context or completion token limits
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const needsChunking = translator.needsChunking(largeContent);
	 * if (needsChunking) {
	 *   console.log('Content will be split into chunks');
	 * }
	 * ```
	 */
	public needsChunking(file: TranslationFile): boolean {
		const estimatedTokens = this.estimateTokenCount(file.content);
		const maxContextInputTokens = this.maxGrossChunkInputTokens - SYSTEM_PROMPT_TOKEN_RESERVE;
		const maxSingleShotInputFromCompletion = this.getMaxChunkInputTokensFromCompletionCap();
		const exceedsContextWindow = estimatedTokens > maxContextInputTokens;
		const exceedsSingleCompletionBudget = estimatedTokens > maxSingleShotInputFromCompletion;
		const needsChunking = exceedsContextWindow || exceedsSingleCompletionBudget;

		file.logger.debug(
			{
				estimatedTokens,
				maxContextInputTokens,
				maxSingleShotInputFromCompletion,
				exceedsContextWindow,
				exceedsSingleCompletionBudget,
				needsChunking,
				contentLength: file.content.length,
			},
			needsChunking ?
				"Content exceeds token limit, chunking required"
			:	"Content within token limit, no chunking needed",
		);

		return needsChunking;
	}

	/**
	 * Splits content into chunks while preserving exact separators between chunks.
	 *
	 * Uses LangChain's {@link MarkdownTextSplitter} for intelligent chunking that respects
	 * markdown structure and code blocks. After splitting, this method analyzes the
	 * original content to detect and preserve the exact whitespace pattern (separator)
	 * that exists between each pair of chunks, enabling perfect reassembly that maintains
	 * the source document's formatting.
	 *
	 * @param content Content to split into manageable chunks for translation
	 * @param maxTokens Maximum tokens per chunk, defaults to safe limit accounting for prompt overhead
	 *
	 * @returns Result object containing chunk array and separator array for reassembly
	 *
	 * @see {@link TranslatorService.translateWithChunking} for usage in translation workflow
	 * @see {@link MarkdownTextSplitter} from LangChain for splitting implementation
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService();
	 * const content = '# Title\n\nContent\n\n## Section\n\nMore...';
	 * const result = await translator.chunkContent(content);
	 *
	 * console.log(result.chunks.length);    	// 3
	 * console.log(result.separators.length); // 2
	 * console.log(result.separators[0]);     // '\n\n'
	 * ```
	 */
	public async chunkContent(
		content: string,
		maxTokens = this.getMarkdownChunkSplitterTokenBudget(),
	): Promise<ChunkingResult> {
		const markdownTextSplitterOptions: Partial<MarkdownTextSplitterParams> = {
			chunkSize: maxTokens,
			chunkOverlap: CHUNKS.overlap,
			lengthFunction: (text: string) => this.estimateTokenCount(text),
		};

		const splitter = new MarkdownTextSplitter(markdownTextSplitterOptions);

		const rawChunks = await splitter.splitText(content);
		const chunks = rawChunks.filter((chunk) => chunk.trim().length > 0);

		const separators: string[] = [];

		/**
		 * Detect the actual separator between each pair of chunks by finding
		 * where each chunk appears in the original content and extracting the
		 * whitespace between them.
		 */
		let searchStartIndex = 0;

		for (let index = 0; index < chunks.length - 1; index++) {
			const currentChunk = chunks[index];
			const nextChunk = chunks[index + 1];

			if (currentChunk == null || nextChunk == null) {
				throw new ApplicationError(
					"Encountered null or undefined chunk while computing separators",
					ErrorCode.ChunkProcessingFailed,
					`${ChunksManager.name}.${this.chunkContent.name}`,
					{ index, chunksLength: chunks.length },
				);
			}

			if (!currentChunk.trim() || !nextChunk.trim()) {
				this.logger.warn(
					{ index, chunksLength: chunks.length },
					"TranslatorService: encountered empty chunk while computing separators",
				);
				separators.push("\n\n");
				continue;
			}
			const currentChunkIndex = content.indexOf(currentChunk.trim(), searchStartIndex);

			if (currentChunkIndex === -1) {
				separators.push("\n\n");
				continue;
			}

			const currentChunkEnd = currentChunkIndex + currentChunk.trim().length;

			const nextChunkIndex = content.indexOf(nextChunk.trim(), currentChunkEnd);

			if (nextChunkIndex === -1) {
				separators.push("\n\n");
				continue;
			}

			const separator = content.substring(currentChunkEnd, nextChunkIndex);
			separators.push(separator);

			searchStartIndex = nextChunkIndex;
		}

		return { chunks, separators };
	}
}
