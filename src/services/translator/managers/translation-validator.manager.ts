import type { LanguageDetectorService } from "@/services/language-detector";

import type { TranslationFile } from "../translation-file";
import type { TranslationValidationIssue } from "../translation-validation.types";

import type { ChunksToReassemble } from "./chunks.manager";

import { ApplicationError, ErrorCode } from "@/errors";
import { collectTopLevelKeysFromInnerYaml } from "@/services/translator/translator-frontmatter.util";
import { collectPostTranslationValidationIssues } from "@/services/translator/translation-validation-guards";
import { logger } from "@/utils";

import { RATIOS, REGEXES, TRANSLATION_PREFIXES } from "./managers.constants";

export type { TranslationValidationIssue } from "../translation-validation.types";

export class TranslationValidatorManager {
	private readonly logger = logger.child({ component: TranslationValidatorManager.name });

	constructor(private readonly languageDetectorService: LanguageDetectorService) {}

	/**
	 * Runs post-translation guards that can trigger an LLM retry with hints.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 *
	 * @returns All retryable issues; empty when the output passes every guard
	 */
	public collectRetryableValidationIssues(
		file: TranslationFile,
		translatedContent: string,
	): TranslationValidationIssue[] {
		return collectPostTranslationValidationIssues(file.content, translatedContent);
	}

	/**
	 * Validates translated content to ensure completeness and quality.
	 *
	 * Hard failures are handled by {@link collectRetryableValidationIssues}. This method
	 * throws when any guard fails, then records soft warnings (ratio drift) without throwing.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.FormatValidationFailed} when a guard fails
	 */
	public validateTranslation(file: TranslationFile, translatedContent: string): void {
		const issues = this.collectRetryableValidationIssues(file, translatedContent);
		if (issues.length > 0) {
			throw this.createValidationFailedError(file, translatedContent, issues);
		}

		this.recordSoftValidationWarnings(file, translatedContent);

		file.logger.debug(
			{
				sizeRatio: (translatedContent.length / file.content.length).toFixed(2),
				originalHeadings: (file.content.match(REGEXES.headings) ?? []).length,
				translatedHeadings: (translatedContent.match(REGEXES.headings) ?? []).length,
			},
			"Translation validation passed",
		);
	}

	/**
	 * Builds an {@link ApplicationError} for failed post-translation guards.
	 *
	 * @param file Original translation file
	 * @param translatedContent Model output that failed validation
	 * @param issues Guard issues collected from {@link collectRetryableValidationIssues}
	 *
	 * @returns Error to throw after the final failed attempt
	 */
	public createValidationFailedError(
		file: TranslationFile,
		translatedContent: string,
		issues: TranslationValidationIssue[],
	) {
		const summary = issues.map((issue) => issue.message).join("; ");

		return new ApplicationError(
			summary,
			ErrorCode.FormatValidationFailed,
			`${TranslationValidatorManager.name}.validateTranslation`,
			{
				filename: file.filename,
				path: file.path,
				originalLength: file.content.length,
				translatedLength: translatedContent.length,
				validationIssues: issues.map(({ guardId, message }) => ({ guardId, message })),
			},
		);
	}

	/**
	 * Logs non-blocking validation warnings (ratio drift, missing optional keys).
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	public recordSoftValidationWarnings(file: TranslationFile, translatedContent: string): void {
		const sizeRatio = translatedContent.length / file.content.length;
		if (sizeRatio < RATIOS.size.min || sizeRatio > RATIOS.size.max) {
			file.logger.warn(
				{
					sizeRatio: sizeRatio.toFixed(2),
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
				`Translation size ratio outside expected range (${RATIOS.size.min}-${RATIOS.size.max})`,
			);
		}

		const originalHeadings = (file.content.match(REGEXES.headings) ?? []).length;
		const translatedHeadings = (translatedContent.match(REGEXES.headings) ?? []).length;
		const headingRatio = originalHeadings > 0 ? translatedHeadings / originalHeadings : 0;

		file.logger.debug(
			{ originalHeadings, translatedHeadings, headingRatio, regex: REGEXES.headings },
			"Heading counts for translation",
		);

		if (originalHeadings === 0) {
			file.logger.warn("Original file contains no markdown headings. Skipping heading validation");
		} else if (headingRatio < RATIOS.heading.min || headingRatio > RATIOS.heading.max) {
			file.logger.warn(
				{ originalHeadings, translatedHeadings, headingRatio: headingRatio.toFixed(2) },
				"Significant heading count mismatch detected",
			);
		}

		this.validateCodeBlockPreservation(file, translatedContent);
		this.validateLinkPreservation(file, translatedContent);
		this.validateFrontmatterIntegrity(file, translatedContent);
	}

	/**
	 * Validates that code blocks are preserved during translation.
	 *
	 * Compares the count of fenced code blocks (triple backticks) between source
	 * and translated content. When the source has no fences but the translation still
	 * contains any after post-processing, logs a warning. Otherwise logs on large ratio drift.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateCodeBlockPreservation(file: TranslationFile, translatedContent: string): void {
		const originalCodeBlocks = (file.content.match(REGEXES.codeBlock) ?? []).length;
		const translatedCodeBlocks = (translatedContent.match(REGEXES.codeBlock) ?? []).length;

		file.logger.debug(
			{ originalCodeBlocks, translatedCodeBlocks },
			"Code block counts for translation",
		);

		if (originalCodeBlocks === 0) {
			if (translatedCodeBlocks > 0) {
				file.logger.warn(
					{ originalCodeBlocks, translatedCodeBlocks },
					"Translation still contains fenced code blocks while source had none",
				);
			}

			return;
		}

		const codeBlockRatio = translatedCodeBlocks / originalCodeBlocks;

		if (codeBlockRatio < RATIOS.codeBlock.min || codeBlockRatio > RATIOS.codeBlock.max) {
			file.logger.warn(
				{ originalCodeBlocks, translatedCodeBlocks, codeBlockRatio: codeBlockRatio.toFixed(2) },
				"Significant code block count mismatch detected",
			);
		}
	}

	/**
	 * Validates that markdown links are preserved during translation.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateLinkPreservation(file: TranslationFile, translatedContent: string): void {
		const originalLinks = (file.content.match(REGEXES.markdownLink) ?? []).length;
		const translatedLinks = (translatedContent.match(REGEXES.markdownLink) ?? []).length;

		file.logger.debug({ originalLinks, translatedLinks }, "Markdown link counts for translation");

		if (originalLinks === 0) {
			file.logger.debug("Original file contains no markdown links. Skipping link validation");
			return;
		}

		const linkRatio = translatedLinks / originalLinks;

		if (linkRatio < RATIOS.link.min || linkRatio > RATIOS.link.max) {
			file.logger.warn(
				{ originalLinks, translatedLinks, linkRatio: linkRatio.toFixed(2) },
				"Significant markdown link count mismatch detected",
			);
		}
	}

	/**
	 * Validates that frontmatter structure and required keys are preserved during translation.
	 *
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateFrontmatterIntegrity(file: TranslationFile, translatedContent: string): void {
		const originalMatch = REGEXES.frontmatter.exec(file.content)?.groups?.["content"];
		REGEXES.frontmatter.lastIndex = 0;
		const translatedMatch = REGEXES.frontmatter.exec(translatedContent)?.groups?.["content"];
		REGEXES.frontmatter.lastIndex = 0;

		if (!originalMatch) {
			file.logger.debug("Original file contains no frontmatter. Skipping frontmatter validation");
			return;
		}

		if (!translatedMatch) {
			return;
		}

		const originalKeys = collectTopLevelKeysFromInnerYaml(originalMatch);
		const translatedKeys = collectTopLevelKeysFromInnerYaml(translatedMatch);

		file.logger.debug(
			{ originalKeys: [...originalKeys], translatedKeys: [...translatedKeys] },
			"Frontmatter keys for translation",
		);

		const missingKeys = [...originalKeys].filter((key) => !translatedKeys.has(key));

		if (missingKeys.length > 0) {
			file.logger.warn(
				{ originalKeys, translatedKeys, missingKeys },
				"Frontmatter keys missing in translation",
			);
		}
	}

	/**
	 * Validates that all chunks were successfully translated and reassembles them.
	 *
	 * @param file Original file containing content to validate
	 * @param chunks Chunking result containing original and translated chunks along with separators
	 *
	 * @throws {ApplicationError} with {@link ErrorCode.ChunkProcessingFailed} when chunk counts differ
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
			const originalMatch = REGEXES.trailingNewlines.exec(file.content);
			const originalTrailingNewlines = originalMatch?.[0] ?? "";
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
	 * @param translatedContent Content returned from the language model
	 * @param file File instance for logger context
	 *
	 * @returns Cleaned translated content with artifacts removed
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
	 * @throws {ApplicationError} with {@link ErrorCode.NoContent} when file content is empty
	 *
	 * @returns Resolves to the detailed language analysis
	 */
	public async getLanguageAnalysis(file: TranslationFile) {
		if (!file.content.length) {
			throw new ApplicationError(
				"File content is empty",
				ErrorCode.NoContent,
				`${TranslationValidatorManager.name}.${this.getLanguageAnalysis.name}`,
				{ contentLength: file.content.length },
			);
		}

		const analysis = await this.languageDetectorService.analyzeLanguage(
			file.filename,
			file.content,
		);

		file.logger.info({ analysis }, "Analyzed language of content");

		return analysis;
	}

	/**
	 * Determines if content is already translated by analyzing its language composition.
	 *
	 * @param file File containing content to analyze
	 *
	 * @returns Resolves to `true` when content is already translated
	 */
	public async isContentTranslated(file: TranslationFile): Promise<boolean> {
		try {
			file.logger.info("Checking if content is already translated");

			const analysis = await this.getLanguageAnalysis(file);

			file.logger.info({ analysis }, "Checked translation status");

			return analysis.isTranslated;
		} catch (error) {
			file.logger.error(
				{ error },
				"Error checking if content is translated. Assuming not translated",
			);

			return false;
		}
	}
}
