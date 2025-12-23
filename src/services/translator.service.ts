import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { encodingForModel } from "js-tiktoken";
import OpenAI from "openai";

import {
	ChunkProcessingError,
	EmptyContentError,
	InitializationError,
	mapLLMError,
	TranslationValidationError,
} from "@/errors/";
import { llmRateLimiter } from "@/services/rate-limiter/";
import {
	env,
	LANGUAGE_SPECIFIC_RULES,
	logger,
	MAX_CHUNK_TOKENS,
	withExponentialBackoff,
} from "@/utils/";

import { LanguageDetectorService } from "./language-detector.service";

/**
 * Result of content chunking operation containing chunks and their separators.
 *
 * The separators array contains the exact whitespace patterns that existed
 * between each pair of chunks in the original content, enabling perfect
 * reassembly that preserves the source formatting.
 */
interface ChunkingResult {
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

/** Represents a file that needs to be translated */
export class TranslationFile {
	constructor(
		/** The content of the file */
		public readonly content: string,

		/** The filename of the file */
		public readonly filename: string,

		/** The path of the file */
		public readonly path: string,

		/** The SHA of the file */
		public readonly sha: string,
	) {}
}

/**
 * Core service for translating content using OpenAI's language models.
 *
 * Handles the entire translation workflow including:
 * - Content parsing and block management
 * - Language model interaction with async language detection
 * - Response processing and cleanup
 * - Translation metrics tracking
 * - Language analysis and detection
 *
 * @example
 * ```typescript
 * const translator = new TranslatorService({ source: 'en', target: 'pt' });
 * translator.setGlossary('React -> React\ncomponent -> componente');
 *
 * const result = await translator.translateContent(file);
 * console.log(result); // Translated content
 * ```
 */
export class TranslatorService {
	private readonly logger = logger.child({ component: TranslatorService.name });

	/** Language model instance for translation */
	private readonly llm = new OpenAI({
		baseURL: env.OPENAI_BASE_URL,
		apiKey: env.OPENAI_API_KEY,
		project: env.OPENAI_PROJECT_ID,
		defaultHeaders: {
			"X-Title": env.HEADER_APP_TITLE,
			"HTTP-Referer": env.HEADER_APP_URL,
		},
	});

	public readonly languageDetector = new LanguageDetectorService();

	public glossary: string | null = null;

	/**
	 * Tests LLM API connectivity and authentication.
	 *
	 * Makes a minimal API call to verify credentials and model availability
	 * before starting the translation workflow. This prevents wasting time
	 * on failed workflows due to API issues.
	 *
	 * @throws {Error} If LLM API is not accessible or credentials are invalid
	 *
	 * @example
	 * ```typescript
	 * await TranslatorService.testConnectivity();
	 * console.log("✅ LLM API is healthy");
	 * ```
	 */
	public async testConnectivity(): Promise<void> {
		try {
			this.logger.info("Testing LLM API connectivity");

			const response = await this.llm.chat.completions.create({
				model: env.LLM_MODEL,
				messages: [{ role: "user", content: "ping" }],
				max_tokens: 5,
				temperature: 0.1,
			});

			if (isLLMResponseValid(response)) {
				throw new InitializationError("Invalid LLM API response: missing response metadata", {
					operation: `${TranslatorService.name}.testConnectivity`,
					metadata: { response },
				});
			}

			this.logger.info(
				{
					model: env.LLM_MODEL,
					response: {
						id: response.id,
						usage: response.usage,
						message: response.choices.at(0)?.message,
					},
				},
				"LLM API connectivity test successful",
			);
		} catch (error) {
			this.logger.fatal(error, "❌ LLM API connectivity test failed");

			throw error;
		}

		function isLLMResponseValid(response: OpenAI.Chat.Completions.ChatCompletion): boolean {
			return !response.id || !response.usage?.total_tokens || !response.choices.at(0)?.message;
		}
	}

	/**
	 * Main translation method that processes files and manages the translation workflow.
	 *
	 * Automatically handles large files through intelligent chunking while preserving
	 * markdown structure and code blocks. Uses token estimation to determine if
	 * content needs to be split into manageable pieces. Includes post-translation
	 * validation to ensure content integrity.
	 *
	 * ### Workflow
	 *
	 * 1. Validates input content
	 * 2. Determines if chunking is needed based on token estimates
	 * 3. Translates content (with chunking if necessary)
	 * 4. Validates translation completeness
	 * 5. Cleans up and returns translated content
	 * 6. Updates metrics
	 *
	 * @param file File containing content to translate
	 *
	 * @returns Promise resolving to translated content
	 *
	 * @throws When translation validation fails or content is empty
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const file = new TranslationFile(
	 *   '# Hello\n\nWelcome to React!',
	 *   'hello.md',
	 *   'docs/hello.md',
	 *   'abc123'
	 * );
	 * const translated = await translator.translateContent(file);
	 * console.log(translated); // '# Olá\n\nBem-vindo ao React!'
	 * ```
	 */
	public async translateContent(file: TranslationFile): Promise<string> {
		if (!file.content.length) {
			throw new EmptyContentError(file.filename, {
				operation: `${TranslatorService.name}.translateContent`,
				metadata: { filename: file.filename, path: file.path },
			});
		}

		this.logger.debug(
			{
				filename: file.filename,
				contentLength: file.content.length,
				estimatedTokens: this.estimateTokenCount(file.content),
			},
			"Starting translation workflow for file",
		);

		const translationStartTime = Date.now();
		const translatedContent = await this.translateWithChunking(file.content);
		const translationDuration = Date.now() - translationStartTime;

		this.validateTranslation(file, translatedContent);

		this.logger.debug(
			{
				filename: file.filename,
				originalLength: file.content.length,
				translatedLength: translatedContent.length,
				durationMs: translationDuration,
				sizeRatio: (translatedContent.length / file.content.length).toFixed(2),
			},
			"Translation completed successfully",
		);

		return this.cleanupTranslatedContent(translatedContent, file.content);
	}

	/**
	 * Validates translated content to ensure completeness and quality.
	 *
	 * Performs a comprehensive set of validation checks to catch potential translation
	 * issues before committing to the repository. This multi-layered validation approach
	 * helps prevent incomplete translations, structural corruption, and content loss.
	 *
	 * ### Validation Checks Performed
	 *
	 * 1. **Empty Content Detection**: Ensures the translation produced actual content
	 *    and is not empty or whitespace-only, which would indicate a critical failure
	 * 2. **Size Ratio Validation**: Compares translated content length to original,
	 *    expecting ratio between 0.5-2.0x as translations typically expand or contract
	 *    within this range depending on language characteristics
	 * 3. **Markdown Structure Preservation**: Validates that markdown headings are
	 *    preserved in the translation, as their complete loss indicates severe
	 *    structural corruption during translation
	 * 4. **Heading Count Consistency**: Ensures heading count remains similar (within
	 *    20% variance) to catch partial content loss while allowing for legitimate
	 *    structural adjustments during translation
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 *
	 * @throws {Error} When critical validation checks fail (empty content, complete heading loss)
	 *
	 * @example
	 * ```typescript
	 * const file = new TranslationFile('# Title\nContent', 'doc.md', 'path', 'sha');
	 * const translated = '# Título\nConteúdo';
	 * validateTranslation(file, translated); // Passes all checks
	 * ```
	 */
	private validateTranslation(file: TranslationFile, translatedContent: string): void {
		if (!translatedContent || translatedContent.trim().length === 0) {
			throw new TranslationValidationError("Translation produced empty content", file.filename, {
				operation: `${TranslatorService.name}.validateTranslation`,
				metadata: {
					filename: file.filename,
					path: file.path,
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
			});
		}

		const sizeRatio = translatedContent.length / file.content.length;
		if (sizeRatio < 0.5 || sizeRatio > 2.0) {
			this.logger.warn(
				{
					filename: file.filename,
					sizeRatio: sizeRatio.toFixed(2),
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
				"Translation size ratio outside expected range (0.5-2.0)",
			);
		}

		const originalHeadings = (file.content.match(/^#{1,6}\s/gm) ?? []).length;
		const translatedHeadings = (translatedContent.match(/^#{1,6}\s/gm) ?? []).length;

		if (originalHeadings > 0 && translatedHeadings === 0) {
			this.logger.error(
				{ filename: file.filename, originalHeadings, translatedHeadings },
				"Translation lost all markdown headings",
			);
			throw new TranslationValidationError(
				"All markdown headings lost during translation",
				file.filename,
				{
					operation: `${TranslatorService.name}.validateTranslation`,
					metadata: {
						path: file.path,
						originalHeadings,
						translatedHeadings,
						originalLength: file.content.length,
						translatedLength: translatedContent.length,
					},
				},
			);
		}

		if (originalHeadings > 0) {
			const headingRatio = translatedHeadings / originalHeadings;
			if (headingRatio < 0.8 || headingRatio > 1.2) {
				this.logger.warn(
					{
						filename: file.filename,
						originalHeadings,
						translatedHeadings,
						headingRatio: headingRatio.toFixed(2),
					},
					"Significant heading count mismatch detected",
				);
			}
		}

		this.logger.debug(
			{
				filename: file.filename,
				sizeRatio: sizeRatio.toFixed(2),
				originalHeadings,
				translatedHeadings,
			},
			"Translation validation passed",
		);
	}

	/**
	 * Determines if content is already translated by analyzing its language composition.
	 * Uses async language detection and scoring to make the determination.
	 *
	 * @param file File containing content to analyze
	 *
	 * @returns Resolves to `true` if content is already translated
	 */
	public async isContentTranslated(file: TranslationFile): Promise<boolean> {
		if (!file.content.length) return false;

		try {
			const analysis = await this.languageDetector.analyzeLanguage(file.filename, file.content);

			this.logger.debug(
				{
					filename: file.filename,
					isTranslated: analysis.isTranslated,
					detectedLanguage: analysis.detectedLanguage,
				},
				"Checked translation status",
			);

			return analysis.isTranslated;
		} catch (error) {
			this.logger.error(
				{
					error,
					filename: file.filename,
					contentLength: file.content.length || 0,
				},
				"Error checking if content is translated - assuming not translated",
			);

			return false;
		}
	}

	/**
	 * Gets detailed language analysis for debugging and metrics.
	 *
	 * @param file File to analyze
	 *
	 * @returns Resolves to the detailed language analysis
	 */
	public async getLanguageAnalysis(file: TranslationFile) {
		if (!file.content.length) {
			throw new EmptyContentError(file.filename, {
				operation: `${TranslatorService.name}.getLanguageAnalysis`,
				metadata: { filename: file.filename, path: file.path },
			});
		}

		return await this.languageDetector.analyzeLanguage(file.filename, file.content);
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
	private estimateTokenCount(content: string): number {
		try {
			const encoding = encodingForModel("gpt-4o-mini");
			const tokens = encoding.encode(content);
			return tokens.length;
		} catch {
			return Math.ceil(content.length / 3.5);
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
	private needsChunking(content: string): boolean {
		const estimatedTokens = this.estimateTokenCount(content);
		const maxInputTokens = MAX_CHUNK_TOKENS - 1000;
		return estimatedTokens > maxInputTokens;
	}

	/**
	 * Splits content into chunks while preserving exact separators between chunks.
	 *
	 * Uses LangChain's `MarkdownTextSplitter` for intelligent chunking that respects
	 * markdown structure and code blocks. After splitting, this method analyzes the
	 * original content to detect and preserve the exact whitespace pattern (separator)
	 * that exists between each pair of chunks, enabling perfect reassembly that maintains
	 * the source document's formatting.
	 *
	 * ### Separator Detection Strategy
	 *
	 * 1. **Split Content**: Uses LangChain splitter to create manageable chunks
	 * 2. **Locate Chunks**: Finds each chunk's position in the original content
	 * 3. **Extract Separators**: Captures exact whitespace between chunk boundaries
	 * 4. **Fallback Handling**: Uses `\n\n` if separator detection fails
	 *
	 * This approach ensures that boundaries with single newlines (`\n`), double newlines
	 * (`\n\n`), or any other whitespace pattern are preserved exactly as they appear in
	 * the source, preventing blank line loss or addition during translation reassembly.
	 *
	 * ### Whitespace Preservation Guarantee
	 *
	 * - **Chunk boundaries**: Each separator is extracted from original content
	 * - **Pattern variety**: Handles `\n`, `\n\n`, `\n\n\n`, and mixed patterns
	 * - **Edge cases**: Works with code blocks, lists, and complex markdown
	 * - **Fallback safety**: Defaults to `\n\n` if boundary detection fails
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
	 * console.log(result.chunks.length);    // 3
	 * console.log(result.separators.length); // 2
	 * console.log(result.separators[0]);     // '\n\n'
	 * ```
	 */
	private async chunkContent(
		content: string,
		maxTokens = MAX_CHUNK_TOKENS - 500,
	): Promise<ChunkingResult> {
		if (!this.needsChunking(content)) {
			return { chunks: [content], separators: [] };
		}

		const splitter = new MarkdownTextSplitter({
			chunkSize: maxTokens,
			chunkOverlap: 200,
			lengthFunction: (text: string) => this.estimateTokenCount(text),
		});

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

			if (!currentChunk?.trim() || !nextChunk?.trim()) {
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

	/**
	 * Translates content using intelligent chunking for large files.
	 *
	 * Handles large files by breaking them into manageable pieces and processing
	 * each chunk separately. Automatically reassembles the translated chunks while
	 * maintaining proper spacing and structure. Includes comprehensive validation
	 * to ensure all chunks are successfully translated before reassembly.
	 *
	 * ### Processing Workflow
	 *
	 * 1. **Chunking Decision**: Determines if content needs chunking based on token count
	 * 2. **Sequential Translation**: Processes each chunk in order, maintaining state
	 * 3. **Progress Tracking**: Logs detailed metrics for each chunk translation
	 * 4. **Validation Gate**: Ensures translated chunk count matches source chunk count
	 * 5. **Reassembly**: Joins translated chunks with single newlines to maintain structure
	 *
	 * ### Reassembly Strategy
	 *
	 * Chunks are joined with a single newline character (`\n`) rather than double newlines.
	 * This is because the chunking process already ensures that each chunk (except the last)
	 * ends with a trailing newline. Using a single newline as the separator preserves the
	 * original spacing and prevents the introduction of extra blank lines between sections.
	 *
	 * ### Performance Characteristics
	 *
	 * - Each chunk is processed sequentially to maintain translation context
	 * - Chunk timing is logged for performance analysis and debugging
	 * - Translation metrics (size ratios, token counts) are tracked per chunk
	 *
	 * ### Error Handling
	 *
	 * - Individual chunk failures are caught and logged with context
	 * - Chunk count mismatches trigger immediate failure before commit
	 * - All errors include detailed metadata for debugging (chunk index, sizes, tokens)
	 *
	 * @param content Content to translate (automatically chunked if exceeds token limit)
	 *
	 * @returns Promise resolving to translated content reassembled from all chunks
	 *
	 * @throws When chunk translation fails or chunk count validation fails
	 *
	 * @see {@link chunkContent} for chunking strategy details
	 * @see {@link callLanguageModel} for individual chunk translation
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const largeContent = '# Very long documentation...\n'.repeat(1000);
	 * const translated = await translator.translateWithChunking(largeContent);
	 * console.log('Translation completed:', translated.length);
	 * ```
	 */
	private async translateWithChunking(content: string): Promise<string> {
		const contentNeedsChunking = this.needsChunking(content);

		if (!contentNeedsChunking) {
			this.logger.debug({ contentLength: content.length }, "Content does not require chunking");
			return await this.callLanguageModel(content);
		}

		const { chunks, separators } = await this.chunkContent(content);
		const translatedChunks: string[] = [];

		this.logger.debug(
			{
				totalChunks: chunks.length,
				originalContentLength: content.length,
				chunkSizes: chunks.map((chunk) => chunk.length),
			},
			"Starting chunked translation workflow",
		);

		for (const [index, chunk] of chunks.entries()) {
			const chunkStartTime = Date.now();

			try {
				this.logger.debug(
					{
						chunkIndex: index + 1,
						totalChunks: chunks.length,
						chunkSize: chunk.length,
						estimatedTokens: this.estimateTokenCount(chunk),
					},
					"Starting translation of chunk",
				);

				const translatedChunk = await this.callLanguageModel(chunk);
				translatedChunks.push(translatedChunk);

				const chunkDuration = Date.now() - chunkStartTime;

				this.logger.info(
					{
						chunkIndex: index + 1,
						totalChunks: chunks.length,
						translatedSize: translatedChunk.length,
						durationMs: chunkDuration,
					},
					"Chunk translated successfully",
				);

				this.logger.debug(
					{
						chunkIndex: index + 1,
						originalLength: chunk.length,
						translatedLength: translatedChunk.length,
						sizeRatio: (translatedChunk.length / chunk.length).toFixed(2),
					},
					"Chunk translation metrics",
				);
			} catch (error) {
				this.logger.error(
					{
						error,
						chunkIndex: index + 1,
						totalChunks: chunks.length,
						translatedSoFar: translatedChunks.length,
					},
					"Failed to translate content chunk",
				);

				throw mapLLMError(error, {
					operation: `${TranslatorService.name}.translateWithChunking`,
					metadata: {
						chunkIndex: index,
						totalChunks: chunks.length,
						chunkSize: chunk.length,
						estimatedTokens: this.estimateTokenCount(chunk),
						translatedChunks: translatedChunks.length,
					},
				});
			}
		}

		/**
		 * Validates that all chunks were successfully translated before reassembly.
		 *
		 * This critical check prevents incomplete translations from being committed
		 * to the repository. A mismatch indicates a serious issue where one or more
		 * chunks failed to translate but the error was not caught properly, or where
		 * the translation array was corrupted during processing.
		 */
		if (translatedChunks.length !== chunks.length) {
			this.logger.error(
				{
					expectedChunks: chunks.length,
					actualChunks: translatedChunks.length,
					missingChunks: chunks.length - translatedChunks.length,
				},
				"Critical: Chunk count mismatch detected",
			);

			throw new ChunkProcessingError(
				`Chunk count mismatch: expected ${String(chunks.length)} chunks, but only ${String(translatedChunks.length)} were translated`,
				{
					operation: `${TranslatorService.name}.translateWithChunking`,
					metadata: {
						expectedChunks: chunks.length,
						actualChunks: translatedChunks.length,
						missingChunks: chunks.length - translatedChunks.length,
						contentLength: content.length,
						chunkSizes: chunks.map((c) => c.length),
					},
				},
			);
		}

		this.logger.debug(
			{
				totalChunks: translatedChunks.length,
				totalTranslatedLength: translatedChunks.reduce((sum, current) => sum + current.length, 0),
				averageChunkSize: Math.round(
					translatedChunks.reduce((sum, current) => sum + current.length, 0) /
						translatedChunks.length,
				),
			},
			"All chunks translated successfully - beginning reassembly",
		);

		let reassembledContent = translatedChunks.reduce(
			(accumulator, chunk, index) => accumulator + chunk + (separators[index] ?? ""),
			"",
		);

		const originalEndsWithNewline = content.endsWith("\n");
		const translatedEndsWithNewline = reassembledContent.endsWith("\n");

		if (originalEndsWithNewline && !translatedEndsWithNewline) {
			const originalTrailingNewlines = /\n+$/.exec(content)?.[0] ?? "";
			reassembledContent += originalTrailingNewlines;

			this.logger.debug(
				{ addedTrailingNewlines: originalTrailingNewlines.length },
				"Restored trailing newlines from original content",
			);
		}

		this.logger.debug(
			{
				reassembledLength: reassembledContent.length,
				originalLength: content.length,
				compressionRatio: (reassembledContent.length / content.length).toFixed(2),
			},
			"Content reassembly completed",
		);

		return reassembledContent;
	}

	/**
	 * Sends content to the language model for translation.
	 *
	 * Constructs system and user prompts based on detected language.
	 * Automatically applies rate limiting to prevent exceeding API limits,
	 * especially important for free-tier LLM models with strict rate limits.
	 *
	 * @param content Content to translate
	 *
	 * @returns Resolves to the translated content
	 */
	private async callLanguageModel(content: string): Promise<string> {
		const systemPrompt = await this.getSystemPrompt(content);

		try {
			this.logger.debug(
				{ model: env.LLM_MODEL, contentLength: content.length, temperature: 0.1 },
				"Calling language model for translation",
			);

			const completion = await withExponentialBackoff(
				() =>
					llmRateLimiter.schedule(() =>
						this.llm.chat.completions.create({
							model: env.LLM_MODEL,
							temperature: 0.1,
							max_tokens: env.MAX_TOKENS,
							messages: [
								{ role: "system", content: systemPrompt },
								{ role: "user", content },
							],
						}),
					),
				{
					maxRetries: 5,
					initialDelay: 2000,
					maxDelay: 60_000,
				},
			);

			const translatedContent = completion.choices[0]?.message.content;

			if (!translatedContent) {
				this.logger.error({ model: env.LLM_MODEL }, "No content returned from language model");

				throw mapLLMError(new Error("No content returned from language model"), {
					operation: `${TranslatorService.name}.callLanguageModel`,
					metadata: {
						model: env.LLM_MODEL,
						contentLength: content.length,
					},
				});
			}

			this.logger.info(
				{
					model: env.LLM_MODEL,
					translatedLength: translatedContent.length,
					tokensUsed: completion.usage?.total_tokens,
				},
				"Translation completed successfully",
			);

			return translatedContent;
		} catch (error) {
			throw mapLLMError(error, {
				operation: `${TranslatorService.name}.callLanguageModel`,
				metadata: {
					model: env.LLM_MODEL,
					contentLength: content.length,
				},
			});
		}
	}

	/**
	 * Removes common artifacts from translation output.
	 *
	 * Cleans translated content by removing LLM-added prefixes and normalizing line endings
	 * to match the original content format. Does not attempt to fix whitespace issues, as
	 * those should be prevented by proper system prompt instructions to the LLM.
	 *
	 * ### Cleanup Operations
	 *
	 * 1. **Prefix Removal**: Strips common LLM response prefixes like "Here is the translation:"
	 * 2. **Line Ending Normalization**: Converts line endings to match original content format
	 *
	 * @param translatedContent Content returned from the language model
	 * @param originalContent Original content before translation (used for line ending detection)
	 *
	 * @returns Cleaned translated content with artifacts removed
	 *
	 * @example
	 * ```typescript
	 * const translated = 'Here is the translation:\n\nActual content...';
	 * const cleaned = cleanupTranslatedContent(translated, original);
	 * console.log(cleaned); // 'Actual content...'
	 * ```
	 */
	private cleanupTranslatedContent(translatedContent: string, originalContent: string): string {
		let cleaned = translatedContent;

		const prefixes = [
			"Here is the translation:",
			"Here's the translation:",
			"Translation:",
			"Translated content:",
			"Here is the translated content:",
			"Here's the translated content:",
		];

		for (const prefix of prefixes) {
			if (cleaned.trim().toLowerCase().startsWith(prefix.toLowerCase())) {
				cleaned = cleaned.substring(prefix.length).trim();
			}
		}

		cleaned = cleaned.trim();

		if (originalContent.includes("\r\n")) {
			cleaned = cleaned.replace(/\n/g, "\r\n");
		}

		return cleaned;
	}

	/**
	 * Creates the system prompt that defines translation rules and requirements.
	 * Uses async language detection to determine source language and constructs
	 * a structured prompt following prompt engineering best practices.
	 *
	 * @param content Content to determine source language
	 *
	 * @returns Resolves to the system prompt string
	 */
	private async getSystemPrompt(content: string): Promise<string> {
		const detectedSourceCode = await this.languageDetector.detectPrimaryLanguage(content);

		const languages = {
			target:
				this.languageDetector.getLanguageName(this.languageDetector.languages.target) ??
				"Brazilian Portuguese",
			source:
				detectedSourceCode ?
					(this.languageDetector.getLanguageName(detectedSourceCode) ?? "English")
				:	"English",
		};

		const glossarySection =
			this.glossary ?
				`\n## TERMINOLOGY GLOSSARY\nApply these exact translations for the specified terms:\n${this.glossary}\n`
			:	"";

		const langSpecificRules =
			languages.target in LANGUAGE_SPECIFIC_RULES ?
				LANGUAGE_SPECIFIC_RULES[languages.target as keyof typeof LANGUAGE_SPECIFIC_RULES]
			:	"";

		return `# ROLE
You are an expert technical translator specializing in React documentation.

# TASK
Translate the provided content from ${languages.source} to ${languages.target} with absolute precision and technical accuracy.

# CRITICAL PRESERVATION RULES
1. **Structure & Formatting**: Preserve ALL markdown syntax, HTML tags, code blocks, frontmatter, and line breaks exactly as written
2. **Code Integrity**: Keep ALL code examples, variable names, function names, and URLs COMPLETELY unchanged
3. **Content Completeness**: Translate EVERY piece of text content WITHOUT adding, removing, or omitting anything
4. **Whitespace Integrity**: ALWAYS preserve blank lines, especially after horizontal rules (---). The pattern '---\n\n##' must remain '---\n\n##' and never become '---\n##'

# TRANSLATION GUIDELINES
## What to Translate
- Natural language text and documentation content
- Code comments and string literals (when they contain user-facing text)
- Alt text, titles, and descriptive content

## What NOT to Translate
- Code syntax, variable names, function names, API endpoints
- Technical terms not specified in the glossary
- URLs, file paths, or configuration values
- Frontmatter keys (only translate values if they're user-facing)

## Quality Standards
- Use natural, fluent ${languages.target} while maintaining technical precision
- Apply consistent terminology throughout the document
- Ensure technical accuracy and clarity for developers

# OUTPUT REQUIREMENTS
- Return ONLY the translated content
- Do NOT add explanatory text, code block wrappers, or prefixes
- Maintain exact whitespace patterns, including list formatting and blank lines
- Preserve any trailing newlines from the original content

${langSpecificRules}

${glossarySection}`;
	}
}
