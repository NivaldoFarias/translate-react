/**
 * @fileoverview
 *
 * Core service for translating content using OpenAI's language models.
 *
 * Handles the entire translation workflow including content parsing, language detection,
 * model interaction, response processing, and metrics tracking.
 */

import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { encodingForModel } from "js-tiktoken";
import OpenAI from "openai";

import {
	ChunkProcessingError,
	EmptyContentError,
	GithubErrorHelper,
	LLMErrorHelper,
	TranslationValidationError,
} from "@/errors/";
import { env, LANGUAGE_SPECIFIC_RULES, logger, MAX_CHUNK_TOKENS } from "@/utils/";

import { LanguageDetectorService } from "./language-detector.service";

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

	private readonly helpers = {
		llm: new LLMErrorHelper(),
		github: new GithubErrorHelper(),
	};

	public readonly languageDetector = new LanguageDetectorService();

	public glossary: string | null = null;

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
		if (!file.content?.length) {
			throw new EmptyContentError(file.filename, {
				operation: "TranslatorService.translateContent",
				file: file.path,
				metadata: { filename: file.filename, path: file.path },
			});
		}

		logger.debug(
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

		logger.debug(
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
				operation: "TranslatorService.validateTranslation",
				file: file.path,
				metadata: {
					filename: file.filename,
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
			});
		}

		const sizeRatio = translatedContent.length / file.content.length;
		if (sizeRatio < 0.5 || sizeRatio > 2.0) {
			logger.warn(
				{
					filename: file.filename,
					sizeRatio: sizeRatio.toFixed(2),
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
				"Translation size ratio outside expected range (0.5-2.0)",
			);
		}

		const originalHeadings = (file.content.match(/^#{1,6}\s/gm) || []).length;
		const translatedHeadings = (translatedContent.match(/^#{1,6}\s/gm) || []).length;

		if (originalHeadings > 0 && translatedHeadings === 0) {
			logger.error(
				{ filename: file.filename, originalHeadings, translatedHeadings },
				"Translation lost all markdown headings",
			);
			throw new TranslationValidationError(
				"All markdown headings lost during translation",
				file.filename,
				{
					operation: "TranslatorService.validateTranslation",
					file: file.path,
					metadata: {
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
				logger.warn(
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

		logger.debug(
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
		if (!file.content?.length) return false;

		try {
			const analysis = await this.languageDetector.analyzeLanguage(file.filename, file.content);

			logger.debug(
				{
					filename: file.filename,
					isTranslated: analysis.isTranslated,
					detectedLanguage: analysis.detectedLanguage,
				},
				"Checked translation status",
			);

			return analysis.isTranslated;
		} catch (error) {
			logger.error(
				{
					error,
					filename: file.filename,
					contentLength: file.content?.length || 0,
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
		if (!file.content?.length) {
			throw new EmptyContentError(file.filename, {
				operation: "TranslatorService.getLanguageAnalysis",
				file: file.path,
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
	 * Splits content into chunks while preserving markdown structure and formatting.
	 *
	 * Uses LangChain's {@link MarkdownTextSplitter} for intelligent chunking that respects
	 * markdown structure and code blocks, ensuring chunks don't exceed the maximum
	 * token limit while maintaining content coherence and readability.
	 *
	 * ### Whitespace Preservation Strategy
	 *
	 * The MarkdownTextSplitter automatically strips trailing whitespace from all chunks,
	 * which can cause improper spacing during reassembly. This method implements a
	 * comprehensive preservation strategy:
	 *
	 * - **Non-final chunks**: Always end with a newline to ensure proper spacing when joined
	 * - **Final chunk**: Preserves the original file's ending exactly - if the source content
	 *   ends with a newline, the last chunk will too; if not, it won't
	 *
	 * This approach ensures that reassembled content maintains identical structure and
	 * whitespace patterns to the original, preventing both missing newlines and extra
	 * blank lines.
	 *
	 * @param content Content to split into manageable chunks
	 * @param maxTokens Maximum tokens per chunk (defaults to safe limit)
	 *
	 * @returns Promise resolving to array of content chunks with preserved markdown structure.
	 *   Non-final chunks are guaranteed to end with `\n`. The final chunk matches the original
	 *   file's ending whitespace pattern exactly.
	 *
	 * @example
	 * ```typescript
	 * const translator = new TranslatorService({ source: 'en', target: 'pt-br' });
	 * const content = '# Title\n\n```js\ncode here\n```\n\nMore content...\n';
	 * const chunks = await translator.chunkContent(content, 1000);
	 * console.log(chunks[0].endsWith('\n')); // true (non-final chunk)
	 * console.log(chunks[chunks.length - 1].endsWith('\n')); // true (matches original)
	 * ```
	 */
	private async chunkContent(
		content: string,
		maxTokens = MAX_CHUNK_TOKENS - 500,
	): Promise<string[]> {
		if (!this.needsChunking(content)) {
			return [content];
		}

		const splitter = new MarkdownTextSplitter({
			chunkSize: maxTokens,
			chunkOverlap: 200,
			lengthFunction: (text: string) => this.estimateTokenCount(text),
		});

		const chunks = await splitter.splitText(content);
		const filteredChunks = chunks.filter((chunk) => chunk.trim().length > 0);
		const originalEndsWithNewline = content.endsWith("\n");

		return filteredChunks.map((chunk, index) => {
			const isLastChunk = index === filteredChunks.length - 1;

			if (isLastChunk) {
				if (originalEndsWithNewline && !chunk.endsWith("\n")) {
					return chunk + "\n";
				}

				return chunk;
			}

			if (!chunk.endsWith("\n")) return chunk + "\n";

			return chunk;
		});
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
			logger.debug({ contentLength: content.length }, "Content does not require chunking");
			return await this.callLanguageModel(content);
		}

		const chunks = await this.chunkContent(content);
		const translatedChunks: string[] = [];

		logger.debug(
			{
				totalChunks: chunks.length,
				originalContentLength: content.length,
				chunkSizes: chunks.map((c) => c.length),
			},
			"Starting chunked translation workflow",
		);

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i]!;
			const chunkStartTime = Date.now();

			try {
				logger.debug(
					{
						chunkIndex: i + 1,
						totalChunks: chunks.length,
						chunkSize: chunk.length,
						estimatedTokens: this.estimateTokenCount(chunk),
					},
					"Starting translation of chunk",
				);

				const translatedChunk = await this.callLanguageModel(chunk);
				translatedChunks.push(translatedChunk);

				const chunkDuration = Date.now() - chunkStartTime;

				logger.info(
					{
						chunkIndex: i + 1,
						totalChunks: chunks.length,
						translatedSize: translatedChunk.length,
						durationMs: chunkDuration,
					},
					"Chunk translated successfully",
				);

				logger.debug(
					{
						chunkIndex: i + 1,
						originalLength: chunk.length,
						translatedLength: translatedChunk.length,
						sizeRatio: (translatedChunk.length / chunk.length).toFixed(2),
					},
					"Chunk translation metrics",
				);
			} catch (error) {
				logger.error(
					{
						error,
						chunkIndex: i + 1,
						totalChunks: chunks.length,
						translatedSoFar: translatedChunks.length,
					},
					"Failed to translate content chunk",
				);

				throw this.helpers.llm.mapError(error, {
					operation: "TranslatorService.translateWithChunking",
					metadata: {
						chunkIndex: i,
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
			logger.error(
				{
					expectedChunks: chunks.length,
					actualChunks: translatedChunks.length,
					missingChunks: chunks.length - translatedChunks.length,
				},
				"Critical: Chunk count mismatch detected",
			);

			throw new ChunkProcessingError(
				`Chunk count mismatch: expected ${chunks.length} chunks, but only ${translatedChunks.length} were translated`,
				{
					operation: "TranslatorService.translateWithChunking",
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

		logger.debug(
			{
				totalChunks: translatedChunks.length,
				totalTranslatedLength: translatedChunks.reduce((sum, c) => sum + c.length, 0),
				averageChunkSize: Math.round(
					translatedChunks.reduce((sum, c) => sum + c.length, 0) / translatedChunks.length,
				),
			},
			"All chunks translated successfully - beginning reassembly",
		);

		const reassembledContent = translatedChunks.join("\n");

		logger.debug(
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
	 * Constructs system and user prompts based on detected language.
	 *
	 * @param content Content to translate
	 *
	 * @returns Resolves to the translated content
	 */
	private async callLanguageModel(content: string): Promise<string> {
		const systemPrompt = await this.getSystemPrompt(content);

		try {
			logger.debug(
				{
					model: env.LLM_MODEL,
					contentLength: content.length,
					temperature: 0.1,
				},
				"Calling language model for translation",
			);

			const completion = await this.llm.chat.completions.create({
				model: env.LLM_MODEL,
				temperature: 0.1,
				max_tokens: env.MAX_TOKENS,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content },
				],
			});

			const translatedContent = completion.choices[0]?.message?.content;

			if (!translatedContent) {
				logger.error({ model: env.LLM_MODEL }, "No content returned from language model");
				throw new LLMErrorHelper().mapError(new Error("No content returned from language model"), {
					operation: "TranslatorService.callLanguageModel",
					metadata: {
						model: env.LLM_MODEL,
						contentLength: content.length,
					},
				});
			}

			logger.info(
				{
					model: env.LLM_MODEL,
					translatedLength: translatedContent.length,
					tokensUsed: completion.usage?.total_tokens,
				},
				"Translation completed successfully",
			);

			return translatedContent;
		} catch (error) {
			throw this.helpers.llm.mapError(error, {
				operation: "TranslatorService.callLanguageModel",
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
	 * @param translatedContent Content returned from the language model
	 * @param originalContent Original content before translation
	 *
	 * @returns Cleaned translated content
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
				this.languageDetector.getLanguageName(this.languageDetector.languages.target) ||
				"Brazilian Portuguese",
			source:
				detectedSourceCode ?
					this.languageDetector.getLanguageName(detectedSourceCode) || "English"
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
