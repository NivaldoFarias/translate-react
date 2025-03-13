import { franc } from "franc";
import OpenAI from "openai";
import { encoding_for_model, TiktokenModel } from "tiktoken";
import { match, P } from "ts-pattern";

import type { LanguageConfig } from "@/utils/language-detector.util";
import type { APIError } from "openai/error";

import { ErrorCode } from "@/errors/base.error";
import { createErrorHandlingProxy } from "@/errors/proxy.handler";
import { LanguageDetector, MAX_CHUNK_TOKENS } from "@/utils/";
import TranslationFile from "@/utils/translation-file.util";

/**
 * # Translation Service
 *
 * Core service for translating content using OpenAI's language models.
 * Handles the entire translation workflow including:
 * - Content parsing and block management
 * - Language model interaction
 * - Response processing
 * - Metrics tracking
 */
export class TranslatorService {
	/** Language model instance for translation */
	private readonly llm = new OpenAI({
		baseURL: import.meta.env.OPENAI_BASE_URL,
		apiKey: import.meta.env.OPENAI_API_KEY,
		defaultHeaders: { "X-Title": "Translate React" },
	});

	private readonly languageDetector: LanguageDetector;

	public glossary: string | null = null;

	/**
	 * Initializes the translator service with the given language configuration
	 *
	 * @param options Language configuration for translation
	 */
	public constructor(private readonly options: LanguageConfig) {
		this.languageDetector = new LanguageDetector({
			source: this.options.source,
			target: this.options.target,
		});

		const errorMap = new Map();

		errorMap.set("APIError", {
			code: ErrorCode.LLM_API_ERROR,
			transform: (error: APIError) => ({
				metadata: { statusCode: error.status, type: error.type },
			}),
		});
		errorMap.set("RateLimitError", { code: ErrorCode.RATE_LIMIT_EXCEEDED });

		this.llm = createErrorHandlingProxy(this.llm, { serviceName: "OpenAI", errorMap });
	}

	/**
	 * Main translation method that processes files and manages the translation workflow
	 *
	 * ## Workflow
	 * 1. Validates input content
	 * 2. Parses content (without modifying code blocks)
	 * 3. Calls language model for translation
	 * 4. Returns translated content
	 * 5. Updates metrics
	 *
	 * @param file File containing content to translate
	 */
	public async translateContent(file: TranslationFile) {
		if (!file.content?.length) {
			throw new Error(`File content is empty: ${file.filename}`);
		}

		const content = await this.callLanguageModel(file.content);

		return this.removeFences(content);
	}

	/**
	 * Determines if content is already translated by analyzing its language composition.
	 * Uses language detection and scoring to make the determination.
	 *
	 * @param file File containing content to analyze
	 *
	 * @returns `true` if content is in target language, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * const isTranslated = detector.isFileTranslated('Olá mundo');
	 * ```
	 */
	public isFileTranslated(file: TranslationFile) {
		const analysis = this.languageDetector.analyzeLanguage(file.filename, file.content);

		return analysis.isTranslated;
	}

	/**
	 * Makes API calls to OpenAI for content translation.
	 * Constructs appropriate prompts and handles response processing.
	 *
	 * @param content Main content to translate
	 */
	private async callLanguageModel(content: string) {
		const response = (await this.llm.chat.completions.create({
			model: import.meta.env.LLM_MODEL,
			messages: this.createPrompt(content),
		})) as OpenAI.Chat.Completions.ChatCompletion | { error: { message: string } };

		if ("error" in response) {
			throw new Error(response.error.message);
		}

		if (response.choices[0]?.finish_reason === "length") {
			return this.chunkAndRetryTranslation(content);
		}

		const translatedContent = response.choices[0]?.message.content;
		if (!translatedContent) {
			throw new Error("No content returned");
		}

		return translatedContent;
	}

	/**
	 * Creates the messages array for the language model
	 *
	 * @param content Main content to translate
	 */
	private createPrompt(content: string) {
		return [
			{
				role: "system" as const,
				content: this.getSystemPrompt(content),
			},
			{
				role: "user" as const,
				content: this.getUserPrompt(content),
			},
		];
	}

	/**
	 * For some reason, some LLMs return the content with fences prepended and appended.
	 * This method removes them.
	 */
	private removeFences(content: string) {
		return content.replace(/^```\n?|\n?```$/g, "");
	}

	/**
	 * Creates the user prompt for the language model.
	 * Includes instructions for content translation and block handling.
	 *
	 * @param content Content to be translated
	 */
	private getUserPrompt(content: string) {
		return `CONTENT TO TRANSLATE:\n${content}\n\n`;
	}

	/**
	 * Creates the system prompt that defines translation rules and requirements.
	 * Includes language specifications, formatting rules, and glossary.
	 *
	 * @param content Content to determine source language
	 */
	private getSystemPrompt(content: string) {
		const languages = {
			target: this.languageDetector.detectLanguage(this.options.target)?.["1"] || "Portuguese",
			source: this.languageDetector.detectLanguage(franc(content))?.["1"] || "English",
		};

		return `
			You are a precise translator specializing in technical documentation. 
			Your task is to translate React documentation from ${languages.source} to ${languages.target} in a single, high-quality pass.

			TRANSLATION AND VERIFICATION REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:
			1. MUST maintain ALL original markdown formatting, including code blocks, links, and special syntax
			2. MUST preserve ALL original code examples exactly as they are
			3. MUST keep ALL original HTML tags intact and unchanged
			4. MUST follow the glossary rules below STRICTLY - these are non-negotiable terms
			5. MUST maintain ALL original frontmatter exactly as in original
			6. MUST preserve ALL original line breaks and paragraph structure
			7. MUST NOT translate code variables, function names, or technical terms not in the glossary
			8. MUST NOT add any content
			9. MUST NOT remove any content. This is very important, DO NOT DO IT!
			10. MUST NOT change any URLs or links
			11. MUST translate comments within code blocks according to the glossary
			12. MUST maintain consistent technical terminology throughout the translation
			13. MUST ensure the translation reads naturally in ${languages.target} while preserving technical accuracy
			14. When translating code blocks, MUST only translate comments and string literals that don't refer to code
			15. MUST respond only with the translated content.
			
			GLOSSARY RULES:
			You must translate the following terms according to the glossary:
			${this.glossary}
		`;
	}

	/**
	 * Gets the appropriate encoding model for the given model name using pattern matching.
	 * Maps various LLM models to their closest tiktoken encoding model.
	 *
	 * @param modelName The name of the model to get the encoding for (defaults to env LLM_MODEL)
	 *
	 * @returns The appropriate TiktokenModel to use for encoding
	 *
	 * @example
	 * ```typescript
	 * // Returns "gpt-4" for "gemini-2.0-flash-lite-001"
	 * const encodingModel = this.getEncodingModel("gemini-2.0-flash-lite-001");
	 * ```
	 */
	private getEncodingModel(modelName = import.meta.env.LLM_MODEL.toLowerCase()): TiktokenModel {
		return match(modelName)
			.with(P.string.includes("gpt-4"), () => "gpt-4" as const)
			.with(P.string.includes("gpt-3.5"), () => "gpt-3.5-turbo" as const)
			.with(P.string.includes("gemini"), () => "gpt-4" as const)
			.otherwise(() => "gpt-3.5-turbo" as const);
	}

	/**
	 * Handles content that exceeds the model's context window by splitting it into
	 * smaller chunks and translating each chunk separately, then combining the results.
	 *
	 * ## Workflow
	 * 1. Estimates token count using tiktoken
	 * 2. Splits content into logical sections (paragraphs, code blocks)
	 * 3. Translates each chunk while maintaining context
	 * 4. Combines translated chunks preserving original structure
	 *
	 * @param content Content that exceeded the model's context window
	 *
	 * @returns Combined translated content from all chunks
	 *
	 * @throws {Error} If chunking fails or if all chunk translation attempts fail
	 */
	private async chunkAndRetryTranslation(content: string): Promise<string> {
		const sections = this.splitIntoLogicalSections(content);
		const encoding = encoding_for_model(this.getEncodingModel());

		const chunks: Array<string> = [];
		const current: { chunk: string; tokenCount: number } = {
			chunk: "",
			tokenCount: 0,
		};

		for (const section of sections) {
			const sectionTokens = encoding.encode(section).length;
			const chunkExceedsLimit = current.tokenCount + sectionTokens > MAX_CHUNK_TOKENS;

			if (chunkExceedsLimit && current.chunk.length > 0) {
				chunks.push(current.chunk);
				current.chunk = section;
				current.tokenCount = sectionTokens;
			} else {
				current.chunk += section;
				current.tokenCount += sectionTokens;
			}
		}

		if (current.chunk.length > 0) chunks.push(current.chunk);

		encoding.free();

		return this.translateChunks(chunks);
	}

	/**
	 * Translates the content of the chunks.
	 *
	 * ## Workflow
	 * 1. Adds context about chunking to help maintain consistency
	 * 2. Translates each chunk
	 * 3. Removes the part prefix if it exists in the response
	 * 4. Combines the translated chunks
	 *
	 * @param chunks The chunks to translate
	 *
	 * @returns The translated content
	 */
	private async translateChunks(chunks: Array<string>) {
		const chunkContext = (index: number, total: number) => `PART ${index + 1} OF ${total}:\n\n`;
		const cleanedChunk = (chunk: string) => chunk.replace(/^PART \d+ OF \d+:\s*\n*/i, "");

		const translatedChunks: Array<string> = [];

		for (const [index, chunk] of chunks.entries()) {
			try {
				const translatedChunk = await this.callLanguageModel(
					chunkContext(index + 1, chunks.length) + chunk,
				);

				if (!translatedChunk) throw new Error("No content returned");

				translatedChunks.push(cleanedChunk(translatedChunk));
			} catch (error) {
				if (error instanceof Error && error.message === "Content is too long") {
					const furtherChunkedTranslation = await this.chunkAndRetryTranslation(chunk);

					translatedChunks.push(furtherChunkedTranslation);
				} else {
					throw error;
				}
			}
		}

		return translatedChunks.join("");
	}

	/**
	 * Splits content into logical sections that preserve context
	 * and structure *(paragraphs, code blocks, headers)*.
	 *
	 * Ensures that related content stays together during chunking.
	 *
	 * ## Workflow
	 * 1. Match patterns for:
	 * 	- Code blocks `(```...```)`
	 * 	- Headers `(# Header)`
	 * 	- Horizontal rules `(---, ***)`
	 * 	- Paragraphs `(\n\n)`
	 * 2. Add the matched delimiter or block as its own section
	 * 3. Merge very small sections with adjacent ones to maintain context
	 *
	 * @param content Content to split into logical sections
	 *
	 * @returns Array of content sections
	 */
	private splitIntoLogicalSections(content: string): Array<string> {
		const sections: Array<string> = [];

		const regex = /(```[\s\S]*?```)|(\n#{1,6} .*\n)|(^---$)|(^\*\*\*$)|(\n\n)/gm;

		let lastIndex = 0;
		let match;

		while ((match = regex.exec(content)) !== null) {
			// If there's content before this match, add it as a section
			if (match.index > lastIndex) {
				sections.push(content.substring(lastIndex, match.index));
			}

			// Add the matched delimiter or block as its own section
			sections.push(match[0]);

			lastIndex = match.index + match[0].length;
		}

		if (lastIndex < content.length) {
			sections.push(content.substring(lastIndex));
		}

		const mergedSections: Array<string> = [];
		let currentSection = "";

		for (const section of sections) {
			// If current section is small, merge it with the next one
			if (currentSection.length < 50) {
				currentSection += section;
			} else {
				// If we have accumulated content, add it as a section
				if (currentSection.length > 0) {
					mergedSections.push(currentSection);
				}
				currentSection = section;
			}
		}

		if (currentSection.length > 0) mergedSections.push(currentSection);

		return mergedSections;
	}
}
