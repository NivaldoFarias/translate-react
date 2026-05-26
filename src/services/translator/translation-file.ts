import crypto from "node:crypto";

import type { Logger } from "pino";

import type { ReactLanguageCode } from "@/utils/";

import { MARKDOWN_REGEXES } from "./markdown/markdown.regexes";
import { extractTitleScalarFromInnerYaml } from "./translator-frontmatter.util";
import { logger } from "@/utils/";

/** Represents a file that needs to be translated */
export class TranslationFile {
	/** The title of the document extracted from frontmatter */
	public readonly title: string | undefined;

	/** Logger instance with file-specific context for workflow tracing */
	public readonly logger: Logger;

	/** Correlation ID for end-to-end tracing across the file's workflow */
	public readonly correlationId: string;

	/**
	 * Resolved CLD source language for system prompts; set before any chunked or scalar LLM call for this logical document.
	 *
	 * @see {@link TranslatorService.translateContent} for when this is populated
	 */
	public documentSourceLanguage?: ReactLanguageCode;

	/**
	 * Builds a translation unit with optional logger parent and optional resolved source language.
	 *
	 * @param content Raw file body as fetched or synthesized for the workflow
	 * @param filename Display filename for logs and PR context
	 * @param path Repository path of the blob
	 * @param sha Git object id for the blob
	 * @param parentLogger Optional child logger parent when this file is a slice or snippet of another unit
	 * @param documentSourceLanguage Optional resolved source language; omit when unknown until translation runs
	 *
	 * @example
	 * ```typescript
	 * const file = new TranslationFile("# Hi", "doc.md", "src/content/doc.md", "abc123");
	 * ```
	 */
	constructor(
		public readonly content: string,
		public readonly filename: string,
		public readonly path: string,
		public readonly sha: string,
		parentLogger?: Logger,
		documentSourceLanguage?: ReactLanguageCode,
	) {
		this.title = this.extractDocTitleFromContent(content);
		this.correlationId = crypto.randomUUID();
		this.logger = (parentLogger ?? logger).child({
			file: this.filename,
			path: this.path,
			correlationId: this.correlationId,
		});
		if (documentSourceLanguage !== undefined) {
			this.documentSourceLanguage = documentSourceLanguage;
		}
	}

	/**
	 * Extracts the document title from leading YAML frontmatter by parsing the inner block with {@link extractTitleScalarFromInnerYaml}.
	 *
	 * @param content The content of the document
	 *
	 * @returns The trimmed `title` string scalar, or `undefined` when there is no frontmatter or `title` is missing or not a string
	 */
	private extractDocTitleFromContent(content: string): string | undefined {
		const frontmatterContentOnly =
			MARKDOWN_REGEXES.frontmatter.exec(content)?.groups?.["content"];

		if (!frontmatterContentOnly) return;

		return extractTitleScalarFromInnerYaml(frontmatterContentOnly);
	}

	/**
	 * Returns a log-safe snapshot of this file (no `content` body).
	 *
	 * Pino `serializers.content` only applies to a top-level `content` key; logging `{ file: this }`
	 * still serializes `file.content` in full, so use this for structured logs.
	 */
	public getLogContext(): {
		filename: string;
		path: string;
		sha: string;
		correlationId: string;
		contentLength: number;
		title: string | undefined;
		documentSourceLanguage: ReactLanguageCode | undefined;
	} {
		return {
			filename: this.filename,
			path: this.path,
			sha: this.sha,
			correlationId: this.correlationId,
			contentLength: this.content.length,
			title: this.title,
			documentSourceLanguage: this.documentSourceLanguage,
		};
	}
}
