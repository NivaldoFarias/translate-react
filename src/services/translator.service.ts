import { franc } from "franc";
import langs from "langs";
import OpenAI from "openai";

import type { ParsedContent, TranslationFile } from "@/types";
import type { LanguageConfig } from "@/utils/language-detector.util";

import { ErrorCodes, extractErrorMessage, GLOSSARY, TranslationError } from "@/utils/";

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
		baseURL: import.meta.env.LLM_BASE_URL,
		apiKey: import.meta.env.LLM_API_KEY,
	});

	/**
	 * Initializes the translator service with the given language configuration
	 *
	 * @param options Language configuration for translation
	 */
	public constructor(private readonly options: LanguageConfig) {}

	/**
	 * Makes API calls to OpenAI for content translation.
	 * Constructs appropriate prompts and handles response processing.
	 *
	 * ## Workflow
	 * 1. Builds system and user prompts
	 * 2. Makes API call with configured model
	 *
	 * @param content Main content to translate
	 */
	private async callLanguageModel(content: string) {
		const messages = [
			{
				role: "system" as const,
				content: this.getSystemPrompt(content),
			},
			{
				role: "user" as const,
				content: this.getUserPrompt(content),
			},
		];

		return await this.llm.chat.completions.create({
			model: import.meta.env.LLM_MODEL,
			messages,
		});
	}

	/**
	 * Creates the messages array for the language model.
	 * Simplified to only include the main content without block translations.
	 *
	 * @param file Parsed content object
	 */
	public getMessages(file: ParsedContent) {
		const messages = [
			{
				role: "system" as const,
				content: this.getSystemPrompt(file.content),
			},
			{
				role: "user" as const,
				content: this.getUserPrompt(file.content),
			},
		];

		return messages;
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
		try {
			if (typeof file.content === "string" && file.content.length === 0) {
				throw new TranslationError(
					`File content is empty: ${file.filename}`,
					ErrorCodes.INVALID_CONTENT,
				);
			}

			const response = await this.callLanguageModel(
				typeof file.content === "string" ? file.content : file.content.content,
			);

			if (response.choices[0]?.finish_reason === "length") {
				throw new TranslationError("Content is too long", ErrorCodes.CONTENT_TOO_LONG);
			}

			const content = response.choices[0]?.message.content;

			if (!content) {
				throw new TranslationError("No content returned", ErrorCodes.NO_CONTENT);
			}

			return this.removeFences(content);
		} catch (error) {
			if (error instanceof TranslationError) throw error;

			throw new TranslationError(
				`Translation failed: ${extractErrorMessage(error)}`,
				ErrorCodes.LLM_API_ERROR,
				{
					filePath: file.filename,
				},
			);
		}
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
			target: langs.where("3", this.options.target)?.["1"] || "Brazilian Portuguese",
			source: langs.where("3", franc(content))?.["1"] || "English",
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
			${GLOSSARY}
		`;
	}
}
