import type { PostTranslationValidationGuard } from "../validation.types";

import { MARKDOWN_REGEXES } from "../../markdown/markdown.regexes";
import { PostTranslationGuardId } from "../validation.constants";

/**
 * Rejects translations that dropped YAML frontmatter
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when frontmatter is preserved
 */
export const frontmatterPreservedGuard: PostTranslationValidationGuard = (source, translated) => {
	const originalMatch = MARKDOWN_REGEXES.frontmatter.exec(source)?.groups?.["content"];
	if (!originalMatch) return null;

	MARKDOWN_REGEXES.frontmatter.lastIndex = 0;

	const translatedMatch = MARKDOWN_REGEXES.frontmatter.exec(translated)?.groups?.["content"];
	MARKDOWN_REGEXES.frontmatter.lastIndex = 0;

	if (translatedMatch) return null;

	return {
		guardId: PostTranslationGuardId.frontmatterPreserved,
		message: "Frontmatter lost during translation",
		retryHint:
			"Keep the leading YAML frontmatter block (`---` delimiters and keys) intact. Only translate allowed string values per the rules; never remove the frontmatter block.",
	};
};
