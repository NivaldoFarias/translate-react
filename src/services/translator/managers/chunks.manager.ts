import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { encodingForModel } from "js-tiktoken";

import type { MarkdownTextSplitterParams } from "@langchain/textsplitters";
import type { Tiktoken, TiktokenModel } from "js-tiktoken";

import type { TranslationFile } from "../translator.service";

import { ApplicationError, ErrorCode } from "@/errors";
import { logger } from "@/utils";

import {
	CHUNKS,
	DEFAULT_TIKTOKEN_MODEL,
	SUPPORTED_TIKTOKEN_MODELS,
	SYSTEM_PROMPT_TOKEN_RESERVE,
	TOKEN_ESTIMATION_FALLBACK_DIVISOR,
} from "./managers.constants";

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

	constructor(private readonly model: string) {}

	/** Lazily-initialized tiktoken encoder instance, cached for performance */
	private cachedEncoder: Tiktoken | null = null;

	/**
	 * Gets or creates a cached tiktoken encoder instance.
	 *
	 * The encoder is expensive to create (~500ms) due to vocabulary loading
	 * and regex compilation, so we cache it for reuse across all token
	 * estimation calls.
	 */
	private get encoder(): Tiktoken {
		const tiktokenModel = this.getTiktokenModel(this.model);
		this.cachedEncoder ??= encodingForModel(tiktokenModel);

		return this.cachedEncoder;
	}

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
		if (supportedModel) return supportedModel;

		this.logger.debug(
			{ model, fallback: DEFAULT_TIKTOKEN_MODEL },
			"Model not supported by tiktoken, using fallback for token counting",
		);

		return DEFAULT_TIKTOKEN_MODEL;
	}

	/**
	 * Estimates token count for content using tiktoken encoding.
	 *
	 * Uses the actual tokenization model to provide accurate token counts
	 * for the specific LLM being used. This is crucial for proper chunking
	 * and avoiding API limits.
	 *
	 * @param content Content to estimate tokens for
	 *
	 * @returns Accurate token count using model-specific encoding
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const tokenCount = translator.estimateTokenCount('# Hello World\n\nWelcome!');
	 * console.log(tokenCount); // ~8 tokens
	 * ```
	 */
	public estimateTokenCount(content: string): number {
		try {
			const tokens = this.encoder.encode(content);

			return tokens.length;
		} catch (error) {
			const fallback = Math.ceil(content.length / TOKEN_ESTIMATION_FALLBACK_DIVISOR);
			this.logger.error({ error }, "Error estimating token count, using fallback");

			return fallback;
		}
	}

	/**
	 * Determines if content needs chunking based on token estimates.
	 *
	 * Checks if the estimated token count exceeds safe limits, leaving buffer
	 * space for system prompt (approximately 1000 tokens) and output tokens
	 * (approximately 8000 tokens).
	 *
	 * @param content Content to check for chunking requirements
	 *
	 * @returns True if content exceeds safe token limits and needs chunking
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
		const maxInputTokens = CHUNKS.maxTokens - SYSTEM_PROMPT_TOKEN_RESERVE;
		const needsChunking = estimatedTokens > maxInputTokens;

		file.logger.debug(
			{ estimatedTokens, maxInputTokens, needsChunking, contentLength: file.content.length },
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
	 * @see {@link translateWithChunking} for usage in translation workflow
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
		maxTokens = CHUNKS.maxTokens - CHUNKS.tokenBuffer,
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
