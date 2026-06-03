import type { Logger } from "pino";

import type { LocaleService } from "@/app/services/locale/";

import type { TranslationAttemptContext } from "../pipeline/translation-attempt.context";
import type { TranslationFile } from "../translation-file";

import type {
	ChunkTranslationProgress,
	TranslationSystemPromptKind,
} from "./translation-system-prompt.types";

import { LanguageDetectorService } from "@/app/services/language-detector/";
import { logger } from "@/app/utils/";

/** Parameters for building a markdown document system prompt */
export interface BuildMarkdownDocumentPromptParams {
	/** Translation file providing resolved source language */
	file: TranslationFile;

	/** User message body for placeholder checks (verbatim fence hints) */
	userMessageContent: string;

	/** When set, documents that `userMessageContent` is one slice of a larger markdown body */
	chunkProgress?: ChunkTranslationProgress;

	/** Guard hints from a failed post-translation validation attempt */
	attemptContext: TranslationAttemptContext;

	/** Optional glossary lines appended to the prompt */
	translationGuidelines: string | null;
}

/**
 * Builds system prompts for markdown body and frontmatter batch LLM calls.
 */
export class TranslationPromptBuilder {
	private readonly componentLogger = logger.child({
		component: TranslationPromptBuilder.name,
	});

	/**
	 * @param languageDetector Resolves human-readable language names for prompts
	 * @param locale Locale-specific translation rules embedded in prompts
	 * @param componentLoggerOverride Optional logger override for tests
	 */
	constructor(
		private readonly languageDetector: LanguageDetectorService,
		private readonly locale: LocaleService,
		private readonly componentLoggerOverride?: Logger,
	) {}

	/**
	 * Builds the system prompt for an LLM translation call.
	 *
	 * @param params Prompt inputs including file, slice progress, and attempt context
	 * @param systemPromptKind Document translation vs batched YAML metadata JSON
	 *
	 * @returns The system prompt string
	 */
	public buildSystemPrompt(
		params: BuildMarkdownDocumentPromptParams,
		systemPromptKind: TranslationSystemPromptKind = "markdownDocument",
	) {
		const documentSourceLanguage = params.file.documentSourceLanguage ?? "en";

		this.getLogger().debug({ systemPromptKind }, "Generating system prompt for translation");

		const languages = {
			target: this.languageDetector.getLanguageName(this.languageDetector.languages.target),
			source: this.languageDetector.getLanguageName(documentSourceLanguage, false),
		};

		this.getLogger().debug(
			{ documentSourceLanguage, languages },
			"Determined source and target languages for prompt",
		);

		if (systemPromptKind === "frontmatterBatch") {
			return this.buildFrontmatterBatchSystemPrompt(languages, params.translationGuidelines);
		}

		return this.buildMarkdownDocumentSystemPrompt(params, languages);
	}

	/**
	 * Builds the markdown document system prompt with preservation rules and optional retry hints.
	 *
	 * @param params Markdown prompt parameters
	 * @param languages Human-readable language names for the prompt
	 * @param languages.source Source language display name
	 * @param languages.target Target language display name
	 *
	 * @returns The system prompt string
	 */
	public buildMarkdownDocumentSystemPrompt(
		params: BuildMarkdownDocumentPromptParams,
		languages: { source: string; target: string },
	) {
		const translationGuidelinesSection =
			params.translationGuidelines ?
				`\n## TRANSLATION GUIDELINES\nApply these exact translations for the specified terms:\n${params.translationGuidelines}\n`
			:	"";

		const chunkSliceSection =
			params.chunkProgress && params.chunkProgress.total > 1 ?
				`
				# DOCUMENT SLICE
				The user message is slice ${params.chunkProgress.index} of ${params.chunkProgress.total} from one continuous markdown file.
				Keep terminology and structure aligned with a single document; translate only the markdown in the user message.
				`
			:	"";

		const validationRetrySection = this.buildValidationRetrySection(params.attemptContext);

		const builtSystemPrompt = `# ROLE
				You are an expert technical translator specializing in React documentation.
	
				# TASK
				Translate the provided content from ${languages.source} to ${languages.target} with absolute precision and technical accuracy.
				${chunkSliceSection}
				${validationRetrySection}
				# CRITICAL PRESERVATION RULES
				1. **Structure & Formatting**: Preserve ALL markdown syntax, HTML tags, code blocks, frontmatter, and line breaks exactly as written
				2. **Code & identifiers**: Keep ALL code examples, URLs, and every programming identifier (functions, variables, classes, hooks, packages, props as in code) unchanged in every context—fenced blocks, inline code, tables, lists, or prose
				3. **Content Completeness**: Translate EVERY piece of text content WITHOUT adding, removing, or omitting anything
				4. **Whitespace Integrity**: ALWAYS preserve blank lines, especially after horizontal rules (---). The pattern '---\n\n##' must remain '---\n\n##' and never become '---\n##'
	
				# TRANSLATION GUIDELINES
				${this.buildMarkdownTranslationScopeSection()}
	
				## What NOT to Translate
				- API endpoints; URLs, paths, and configuration values; technical terms unless the translation guidelines map them
				- YAML frontmatter key names; the \`title\` value is not machine-translated; only a string \`description\` value may be translated in a dedicated pass after the body
	
				## Quality Standards
				- Use natural, fluent ${languages.target} while maintaining technical precision
				- Apply consistent terminology throughout the document
				- Ensure technical accuracy and clarity for developers
	
				# OUTPUT REQUIREMENTS
				- Return ONLY the translated content
				- Do NOT add explanatory text, code block wrappers, or prefixes
				- Maintain exact whitespace patterns, including list formatting and blank lines
				- Preserve any trailing newlines from the original content
	
				${this.locale.definitions.rules.specific}
	
				${translationGuidelinesSection}
			`;

		const verbatimPlaceholderSection =
			params.userMessageContent.includes("<!-- translate-react:verbatim-fence-") ?
				`
				# VERBATIM SOURCE PLACEHOLDERS
				Some fenced code regions were replaced with HTML comments matching \`<!-- translate-react:verbatim-fence-N -->\`.
				Copy each placeholder comment EXACTLY into your output at the same position; never translate, remove, reorder, or alter these comments.
				`
			:	"";

		return builtSystemPrompt + verbatimPlaceholderSection;
	}

	/**
	 * Builds the system prompt for batched YAML frontmatter string translation with structured JSON output.
	 *
	 * @param languages Human-readable language names for the TASK section
	 * @param languages.source Source language display name
	 * @param languages.target Target language display name
	 * @param translationGuidelines Optional glossary for terminology alignment
	 *
	 * @returns The system prompt string for the frontmatter batch completion
	 */
	public buildFrontmatterBatchSystemPrompt(
		languages: { source: string; target: string },
		translationGuidelines: string | null,
	) {
		const termReferenceSection =
			translationGuidelines ?
				`
				# TERM REFERENCE (DO NOT OUTPUT)
				Use only for consistent terminology when translating each \`source\` string. Never copy, quote, translate, summarize, or repeat this reference in your reply JSON.
	
				${translationGuidelines}
				`
			:	"";

		return `# ROLE
				You are an expert technical translator for React documentation YAML metadata.
	
				# TASK
				The user message is a single JSON object with an \`items\` array of length 1. The element has \`fieldKey\` "description" and \`source\` (the English string to translate). Translate \`source\` from ${languages.source} to ${languages.target}.
	
				# OUTPUT (STRICT)
				- Reply with JSON only, matching the response schema: an object \`items\` whose length equals the request, each item having \`fieldKey\` (same as input) and \`translated\` (the translated string only).
				- Do not add markdown, code fences, or commentary outside the JSON object.
				- Preserve intentional internal line breaks in a string only when the corresponding \`source\` already uses multiple lines you must keep.
	
				# RULES
				- Translate only natural language in each \`source\` value
				- Keep programming identifiers, proper nouns, versions, code-like tokens, and URLs unchanged unless the term reference explicitly maps them
				- Never translate the JSON keys \`fieldKey\`, \`source\`, \`items\`, or \`translated\` themselves
	
				${this.locale.definitions.rules.specific}
	
				${termReferenceSection}
				`;
	}

	/**
	 * Builds the correction section appended when post-translation guards failed.
	 *
	 * @param attemptContext Attempt context with accumulated guard hints
	 *
	 * @returns Correction section or empty string when no hints
	 */
	public buildValidationRetrySection(attemptContext: TranslationAttemptContext) {
		if (attemptContext.validationRetryHints.length === 0) return "";

		return `
				# CORRECTION REQUIRED (previous attempt failed validation)
				A previous translation of this content was rejected. Apply every correction below in a new full translation of the user message:
				${attemptContext.validationRetryHints.map((hint) => `- ${hint}`).join("\n")}
				`;
	}

	/**
	 * Builds the "What to Translate" scope for markdown body translation.
	 *
	 * pt-br uses stricter fenced-code rules aligned with pt-br.react.dev; other locales keep the default scope.
	 *
	 * @returns Markdown bullet sections for translation scope
	 */
	private buildMarkdownTranslationScopeSection() {
		if (this.locale.languageCode === "pt-br") {
			return `
				## What to Translate
				- Natural language text and documentation content outside fenced code blocks
				- Alt text, titles, and descriptive content in prose
	
				## Fenced code blocks and MDX in examples
				- Do NOT translate demo UI strings: quoted literals and JSX text between tags inside fenced code. Copy them exactly from the source.
				- Keep programming identifiers unchanged in every fenced block.
				- For \`//\` and \`/* */\` comments in fenced code, follow the locale-specific fenced-code rules below (React API terms stay in English; translate full comment text when translating).
				- Keep \`<ConsoleLogLine>\` and similar MDX console message text in English to match runtime output.
			`;
		}

		return `
				## What to Translate
				- Natural language text and documentation content
				- Code comments and string literals (when they contain user-facing text)
				- Alt text, titles, and descriptive content
			`;
	}

	private getLogger() {
		return this.componentLoggerOverride ?? this.componentLogger;
	}
}
