import type { TranslationFile } from "../translation-file";

import { MARKDOWN_REGEXES } from "../markdown/markdown.regexes";
import { TRANSLATION_PREFIXES } from "../validation/validation.constants";

/**
 * Removes common artifacts from translation output.
 *
 * @param translatedContent Content returned from the language model
 * @param file File instance for logger context
 *
 * @returns Cleaned translated content with artifacts removed
 */
export function cleanupTranslatedContent(translatedContent: string, file: TranslationFile) {
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
		cleaned = cleaned.replace(MARKDOWN_REGEXES.lineEnding, "\r\n");
	}

	file.logger.debug(
		{ cleanedContentLength: cleaned.length },
		"Translated content cleanup completed",
	);

	return cleaned;
}
