import type { TranslationFile } from "../translation-file";

import type {
	PostTranslationValidationOptions,
	TranslationValidationIssue,
} from "./validation.types";

import { collectTopLevelKeysFromInnerYaml } from "@/app/services/translator/markdown/frontmatter";
import { ApplicationError, ErrorCode } from "@/shared/errors";

import { MARKDOWN_REGEXES } from "../markdown/markdown.regexes";

import { collectPostTranslationValidationIssues } from "./guards";
import { VALIDATION_RATIOS } from "./validation.constants";

export type { TranslationValidationIssue } from "./validation.types";

/** Dependencies for {@link PostTranslationValidationService} */
export interface PostTranslationValidationServiceDependencies {
	/** Upstream glossary markdown when loaded on the translator */
	readonly getTranslationGuidelines?: () => string | null;
}

/**
 * Runs post-translation guards and records soft validation warnings.
 */
export class PostTranslationValidationService {
	private readonly getTranslationGuidelines: () => string | null;

	/**
	 * @param dependencies Optional glossary provider for terminology guards
	 */
	constructor(dependencies: PostTranslationValidationServiceDependencies = {}) {
		this.getTranslationGuidelines = dependencies.getTranslationGuidelines ?? (() => null);
	}

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
		return collectPostTranslationValidationIssues(file.content, translatedContent, {
			translationGuidelines: this.getTranslationGuidelines(),
		} satisfies PostTranslationValidationOptions);
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
				originalHeadings: (file.content.match(MARKDOWN_REGEXES.headings) ?? []).length,
				translatedHeadings: (translatedContent.match(MARKDOWN_REGEXES.headings) ?? []).length,
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
			`${PostTranslationValidationService.name}.validateTranslation`,
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
		if (sizeRatio < VALIDATION_RATIOS.size.min || sizeRatio > VALIDATION_RATIOS.size.max) {
			file.logger.warn(
				{
					sizeRatio: sizeRatio.toFixed(2),
					originalLength: file.content.length,
					translatedLength: translatedContent.length,
				},
				`Translation size ratio outside expected range (${VALIDATION_RATIOS.size.min}-${VALIDATION_RATIOS.size.max})`,
			);
		}

		const originalHeadings = (file.content.match(MARKDOWN_REGEXES.headings) ?? []).length;
		const translatedHeadings = (translatedContent.match(MARKDOWN_REGEXES.headings) ?? []).length;
		const headingRatio = originalHeadings > 0 ? translatedHeadings / originalHeadings : 0;

		file.logger.debug(
			{ originalHeadings, translatedHeadings, headingRatio, regex: MARKDOWN_REGEXES.headings },
			"Heading counts for translation",
		);

		if (originalHeadings === 0) {
			file.logger.warn("Original file contains no markdown headings. Skipping heading validation");
		} else if (
			headingRatio < VALIDATION_RATIOS.heading.min ||
			headingRatio > VALIDATION_RATIOS.heading.max
		) {
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
	 * @param file Original file containing source content for comparison
	 * @param translatedContent Translated content to validate against source
	 */
	private validateCodeBlockPreservation(file: TranslationFile, translatedContent: string): void {
		const originalCodeBlocks = (file.content.match(MARKDOWN_REGEXES.codeBlock) ?? []).length;
		const translatedCodeBlocks = (translatedContent.match(MARKDOWN_REGEXES.codeBlock) ?? []).length;

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

		if (
			codeBlockRatio < VALIDATION_RATIOS.codeBlock.min ||
			codeBlockRatio > VALIDATION_RATIOS.codeBlock.max
		) {
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
		const originalLinks = (file.content.match(MARKDOWN_REGEXES.markdownLink) ?? []).length;
		const translatedLinks = (translatedContent.match(MARKDOWN_REGEXES.markdownLink) ?? []).length;

		file.logger.debug({ originalLinks, translatedLinks }, "Markdown link counts for translation");

		if (originalLinks === 0) {
			file.logger.debug("Original file contains no markdown links. Skipping link validation");
			return;
		}

		const linkRatio = translatedLinks / originalLinks;

		if (linkRatio < VALIDATION_RATIOS.link.min || linkRatio > VALIDATION_RATIOS.link.max) {
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
		const originalMatch = MARKDOWN_REGEXES.frontmatter.exec(file.content)?.groups?.["content"];
		MARKDOWN_REGEXES.frontmatter.lastIndex = 0;
		const translatedMatch =
			MARKDOWN_REGEXES.frontmatter.exec(translatedContent)?.groups?.["content"];
		MARKDOWN_REGEXES.frontmatter.lastIndex = 0;

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
}
