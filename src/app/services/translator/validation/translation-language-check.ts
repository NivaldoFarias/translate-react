import type { LanguageDetectorService } from "@/app/services/language-detector";

import type { TranslationFile } from "../translation-file";

import { ApplicationError, ErrorCode } from "@/shared/errors";

/**
 * Language detection helpers for translation files.
 */
export class TranslationLanguageCheck {
	/**
	 * @param languageDetectorService CLD-backed language detector
	 */
	constructor(private readonly languageDetectorService: LanguageDetectorService) {}

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
				`${TranslationLanguageCheck.name}.${this.getLanguageAnalysis.name}`,
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
