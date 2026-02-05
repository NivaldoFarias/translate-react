import type { LanguageDetectorService } from "@/services/language-detector";

import type { TranslationFile } from "../translator.service";

import type { ChunksToReassemble } from "./chunks.manager";

import { ApplicationError, ErrorCode } from "@/errors";
import { logger } from "@/utils";

import {
	RATIOS,
	REGEXES,
	REQUIRED_FRONTMATTER_KEYS,
	TRANSLATION_PREFIXES,
} from "./managers.contants";

export class TranslationValidatorManager {
	private readonly logger = logger.child({ component: TranslationValidatorManager.name });

	constructor(private readonly languageDetectorService: LanguageDetectorService) {}

	/**
	 * Validates translated content to ensure completeness and quality.
	 *
	 * Performs a comprehensive set of validation checks to catch potential translation
	 * issues before committing to the repository. This multi-layered validation approach
	 * helps prevent incomplete translations, structural corruption, and content loss.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.FormatValidationFailed} if validation checks fail (empty content, complete heading loss)
	 *
	 * @example
	 * ```typescript
	 * const file = new TranslationFile('# Title\nContent', 'doc.md', 'path', 'sha');
	 * const translated = '# Título\nConteúdo';
	 * validateTranslation(file, translated); // Passes all checks
	 * ```
	 */
	public validateTranslation(file: TranslationFile, translatedContent: string): void {
		if (!translatedContent || translatedContent.trim().length === 0) {
			file.logger.error(
				{ filename: file.filename, translatedContent },
				"Translated content is empty",
			);

			throw new ApplicationError(
				"Translation produced empty content",
				ErrorCode.FormatValidationFailed,
				`${TranslationValidatorManager.name}.${this.validateTranslation.name}`,
				{
					filename: file.filename,
					path: file.path,
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
			);
		}

		const sizeRatio = translatedContent.length / file.content.length;
		if (sizeRatio < RATIOS.size.min || sizeRatio > RATIOS.size.max) {
			file.logger.warn(
				{
					filename: file.filename,
					sizeRatio: sizeRatio.toFixed(2),
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
				`Translation size ratio outside expected range (${RATIOS.size.min}-${RATIOS.size.max})`,
			);
		}

		const originalHeadings = (file.content.match(REGEXES.headings) ?? []).length;
		const translatedHeadings = (translatedContent.match(REGEXES.headings) ?? []).length;
		const headingRatio = translatedHeadings / originalHeadings;

		file.logger.debug(
			{ originalHeadings, translatedHeadings, headingRatio, regex: REGEXES.headings },
			`Heading counts for ${file.filename}`,
		);

		if (originalHeadings === 0) {
			file.logger.warn("Original file contains no markdown headings. Skipping heading validation");
			return;
		}

		if (translatedHeadings === 0) {
			throw new ApplicationError(
				"All markdown headings lost during translation",
				ErrorCode.FormatValidationFailed,
				`${TranslationValidatorManager.name}.${this.validateTranslation.name}`,
				{
					path: file.path,
					originalHeadings,
					translatedHeadings,
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
			);
		} else if (headingRatio < RATIOS.heading.min || headingRatio > RATIOS.heading.max) {
			file.logger.warn(
				{
					filename: file.filename,
					originalHeadings,
					translatedHeadings,
					headingRatio: headingRatio.toFixed(2),
				},
				"Significant heading count mismatch detected",
			);
		}

		this.validateCodeBlockPreservation(file, translatedContent);
		this.validateLinkPreservation(file, translatedContent);
		this.validateFrontmatterIntegrity(file, translatedContent);

		file.logger.debug(
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
	 * Validates that code blocks are preserved during translation.
	 *
	 * Compares the count of fenced code blocks (triple backticks) between source
	 * and translated content. Logs a warning if there's a significant mismatch
	 * (>20% difference), as this may indicate code blocks were corrupted or removed.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateCodeBlockPreservation(file: TranslationFile, translatedContent: string): void {
		const originalCodeBlocks = (file.content.match(REGEXES.codeBlock) ?? []).length;
		const translatedCodeBlocks = (translatedContent.match(REGEXES.codeBlock) ?? []).length;

		file.logger.debug(
			{ originalCodeBlocks, translatedCodeBlocks },
			`Code block counts for ${file.filename}`,
		);

		if (originalCodeBlocks === 0) {
			file.logger.debug("Original file contains no code blocks. Skipping code block validation");
			return;
		}

		const codeBlockRatio = translatedCodeBlocks / originalCodeBlocks;

		if (codeBlockRatio < RATIOS.codeBlock.min || codeBlockRatio > RATIOS.codeBlock.max) {
			file.logger.warn(
				{
					filename: file.filename,
					originalCodeBlocks,
					translatedCodeBlocks,
					codeBlockRatio: codeBlockRatio.toFixed(2),
				},
				"Significant code block count mismatch detected - code blocks may have been corrupted or removed",
			);
		}
	}

	/**
	 * Validates that markdown links are preserved during translation.
	 *
	 * Compares the count of markdown links between source and translated content.
	 * Logs a warning if there's a significant mismatch (>20% difference), as this
	 * may indicate links were broken or removed during translation.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateLinkPreservation(file: TranslationFile, translatedContent: string): void {
		const originalLinks = (file.content.match(REGEXES.markdownLink) ?? []).length;
		const translatedLinks = (translatedContent.match(REGEXES.markdownLink) ?? []).length;

		file.logger.debug(
			{ originalLinks, translatedLinks },
			`Markdown link counts for ${file.filename}`,
		);

		if (originalLinks === 0) {
			file.logger.debug("Original file contains no markdown links. Skipping link validation");
			return;
		}

		const linkRatio = translatedLinks / originalLinks;

		if (linkRatio < RATIOS.link.min || linkRatio > RATIOS.link.max) {
			file.logger.warn(
				{
					filename: file.filename,
					originalLinks,
					translatedLinks,
					linkRatio: linkRatio.toFixed(2),
				},
				"Significant markdown link count mismatch detected - links may have been broken or removed",
			);
		}
	}

	/**
	 * Validates that frontmatter structure and required keys are preserved during translation.
	 *
	 * Parses YAML frontmatter from source and translated content, then verifies that:
	 * 1. Required keys (e.g., `title`) are preserved in translation
	 * 2. The overall frontmatter structure remains intact
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateFrontmatterIntegrity(file: TranslationFile, translatedContent: string): void {
		const originalFrontmatter = REGEXES.frontmatter.exec(file.content)?.[1];
		const translatedFrontmatter = REGEXES.frontmatter.exec(translatedContent)?.[1];

		if (!originalFrontmatter) {
			file.logger.debug("Original file contains no frontmatter. Skipping frontmatter validation");
			return;
		}

		if (!translatedFrontmatter) {
			file.logger.warn(
				{ filename: file.filename },
				"Frontmatter lost during translation - original had frontmatter but translation does not",
			);
			return;
		}

		const extractKeys = (content: string): Set<string> => {
			const keys = new Set<string>();
			let match: RegExpExecArray | null;

			const regex = new RegExp(REGEXES.frontmatterKey.source, REGEXES.frontmatterKey.flags);
			while ((match = regex.exec(content)) !== null) {
				if (match[1]) keys.add(match[1]);
			}
			return keys;
		};

		const originalKeys = extractKeys(originalFrontmatter);
		const translatedKeys = extractKeys(translatedFrontmatter);

		file.logger.debug(
			{
				originalKeys: [...originalKeys],
				translatedKeys: [...translatedKeys],
			},
			`Frontmatter keys for ${file.filename}`,
		);

		const missingRequiredKeys = REQUIRED_FRONTMATTER_KEYS.filter(
			(key) => originalKeys.has(key) && !translatedKeys.has(key),
		);

		if (missingRequiredKeys.length > 0) {
			file.logger.warn(
				{
					filename: file.filename,
					missingRequiredKeys,
					originalKeys: [...originalKeys],
					translatedKeys: [...translatedKeys],
				},
				"Required frontmatter keys missing in translation",
			);
		}

		const missingKeys = [...originalKeys].filter((key) => !translatedKeys.has(key));

		if (missingKeys.length > 0 && missingKeys.some((key) => !missingRequiredKeys.includes(key))) {
			const nonRequiredMissing = missingKeys.filter((key) => !missingRequiredKeys.includes(key));
			file.logger.warn(
				{
					filename: file.filename,
					missingKeys: nonRequiredMissing,
				},
				"Some frontmatter keys missing in translation",
			);
		}
	}

	/**
	 * Validates that all chunks were successfully translated and reassembles them.
	 * Ensures that the number of translated chunks matches the original chunk count.
	 *
	 * ### Reassembly Strategy
	 *
	 * Chunks are joined with a single newline character (`\n`) rather than double newlines.
	 * This is because the chunking process already ensures that each chunk (except the last)
	 * ends with a trailing newline. Using a single newline as the separator preserves the
	 * original spacing and prevents the introduction of extra blank lines between sections.
	 *
	 * @param file Original file containing content to validate
	 * @param chunks Chunking result containing original and translated chunks along with separators
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.ChunkProcessingFailed}
	 * if chunk count mismatch is detected
	 *
	 * @returns Reassembled translated content
	 */
	public validateAndReassembleChunks(file: TranslationFile, chunks: ChunksToReassemble): string {
		if (chunks.translated.length !== chunks.original.length) {
			throw new ApplicationError(
				`Chunk count mismatch`,
				ErrorCode.ChunkProcessingFailed,
				`${TranslationValidatorManager.name}.${this.validateAndReassembleChunks.name}`,
				{
					expectedChunks: chunks.original.length,
					actualChunks: chunks.translated.length,
					missingChunks: chunks.original.length - chunks.translated.length,
					contentLength: file.content.length,
					chunkSizes: chunks.original.map((chunk) => chunk.length),
				},
			);
		}

		let reassembledContent = chunks.translated.reduce((accumulator, chunk, index) => {
			return accumulator + chunk + (chunks.separators[index] ?? "");
		}, "");

		const originalEndsWithNewline = file.content.endsWith("\n");
		const translatedEndsWithNewline = reassembledContent.endsWith("\n");

		if (originalEndsWithNewline && !translatedEndsWithNewline) {
			const originalTrailingNewlines = REGEXES.trailingNewlines.exec(file.content)?.[0] ?? "";
			reassembledContent += originalTrailingNewlines;

			file.logger.debug(
				{ addedTrailingNewlines: originalTrailingNewlines.length },
				"Restored trailing newlines from original content",
			);
		}

		file.logger.debug(
			{
				originalLength: file.content.length,
				reassembledLength: reassembledContent.length,
				compressionRatio: (reassembledContent.length / file.content.length).toFixed(2),
			},
			"Content reassembly completed",
		);

		return reassembledContent;
	}

	/**
	 * Removes common artifacts from translation output.
	 *
	 * Strips common LLM response prefixes like "Here is the translation:"
	 * and converts line endings to match original content format
	 *
	 * @param translatedContent Content returned from the language model
	 * @param file File instance for logger context
	 *
	 * @returns Cleaned translated content with artifacts removed
	 *
	 * @example
	 * ```typescript
	 * const translated = 'Here is the translation:\n\nActual content...';
	 * const cleaned = cleanupTranslatedContent(translated, file);
	 * console.log(cleaned); // 'Actual content...'
	 * ```
	 */
	public cleanupTranslatedContent(translatedContent: string, file: TranslationFile): string {
		file.logger.debug(
			{ translatedContentLength: translatedContent.length },
			"Cleaning up translated content",
		);

		let cleaned = translatedContent;

		for (const prefix of TRANSLATION_PREFIXES) {
			if (cleaned.trim().toLowerCase().startsWith(prefix.toLowerCase())) {
				cleaned = cleaned.substring(prefix.length).trim();
			}
		}

		cleaned = cleaned.trim();

		file.logger.debug(
			{ originalContentLength: file.content.length, cleanedContentLength: cleaned.length },
			"Adjusting line endings to match original content",
		);

		if (file.content.includes("\r\n")) {
			cleaned = cleaned.replace(REGEXES.lineEnding, "\r\n");
		}

		file.logger.debug(
			{ cleanedContentLength: cleaned.length },
			"Translated content cleanup completed",
		);

		return cleaned;
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
			throw new ApplicationError(
				"File content is empty",
				ErrorCode.NoContent,
				`${TranslationValidatorManager.name}.${this.getLanguageAnalysis.name}`,
				{ filename: file.filename, path: file.path, contentLength: file.content.length },
			);
		}

		const analysis = await this.languageDetectorService.analyzeLanguage(
			file.filename,
			file.content,
		);

		this.logger.info({ analysis }, "Analyzed language of content");

		return analysis;
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
		try {
			this.logger.info({ filename: file.filename }, "Checking if content is already translated");

			const analysis = await this.getLanguageAnalysis(file);

			this.logger.info({ analysis }, "Checked translation status");

			return analysis.isTranslated;
		} catch (error) {
			this.logger.error(
				{ error },
				"Error checking if content is translated. Assuming not translated",
			);

			return false;
		}
	}
}
