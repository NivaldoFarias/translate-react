import { TRANSLATION_COMMIT_MESSAGE_PREFIX } from "@/app/constants";

/**
 * Builds the fork commit message for a translated file.
 *
 * @param filename Basename of the translated markdown file
 * @param languageName Human-readable target language name
 *
 * @returns Subject line for the translation commit
 */
export function buildTranslationCommitMessage(filename: string, languageName: string) {
	return `${TRANSLATION_COMMIT_MESSAGE_PREFIX}\`${filename}\` to ${languageName}`;
}
