import { franc } from "franc";
import OpenAI from "openai";

import type { LanguageConfig } from "@/utils/language-detector.util";

import { ErrorCode } from "@/errors/base.error";
import { createErrorHandlingProxy } from "@/errors/proxy.handler";
import { LanguageDetector } from "@/utils/";
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

		// Wrap the OpenAI client with error handling
		this.llm = createErrorHandlingProxy(this.llm, {
			serviceName: "OpenAI",
			errorMap: {
				APIError: {
					code: ErrorCode.LLM_API_ERROR,
					transform: (error: Error) => ({
						metadata: {
							statusCode: (error as any).status,
							type: (error as any).type,
						},
					}),
				},
				RateLimitError: {
					code: ErrorCode.RATE_LIMIT_EXCEEDED,
				},
			},
		});
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
			throw new Error("Content is too long");
		}

		const translatedContent = response.choices[0]?.message.content;
		if (!translatedContent) {
			throw new Error("No content returned");
		}

		return translatedContent;
	}

	/**
	 * Creates the messages array for the language model.
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
	 * Main translation method that processes files and manages the translation workflow.
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
}
