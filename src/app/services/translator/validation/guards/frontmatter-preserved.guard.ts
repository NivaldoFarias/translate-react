import type { PostTranslationValidationGuard } from "../validation.types";

import { MARKDOWN_REGEXES } from "../../markdown/markdown.regexes";
import { POST_TRANSLATION_GUARD_IDS } from "../validation.constants";

/** Frontmatter block dropped from a translation that had YAML frontmatter in the source */
export interface FrontmatterPreservedViolation {
	readonly sourceFrontmatterBlockLength: number;
}

/**
 * Detects when the source has YAML frontmatter but the translation dropped it.
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Violation metadata, or `null` when frontmatter is preserved or absent in the source
 */
export function detectFrontmatterPreservedViolation(
	source: string,
	translated: string,
): FrontmatterPreservedViolation | null {
	const sourceMatch = MARKDOWN_REGEXES.frontmatter.exec(source);
	MARKDOWN_REGEXES.frontmatter.lastIndex = 0;
	if (!sourceMatch?.groups?.["content"]) {
		return null;
	}

	const translatedMatch = MARKDOWN_REGEXES.frontmatter.exec(translated)?.groups?.["content"];
	MARKDOWN_REGEXES.frontmatter.lastIndex = 0;
	if (translatedMatch) {
		return null;
	}

	return { sourceFrontmatterBlockLength: sourceMatch[0].length };
}

/**
 * Rejects translations that dropped YAML frontmatter
 *
 * @param source Original markdown before translation
 * @param translated Model output to validate
 *
 * @returns Guard failure with retry hint, or `null` when frontmatter is preserved
 */
export const frontmatterPreservedGuard: PostTranslationValidationGuard = (source, translated) => {
	const violation = detectFrontmatterPreservedViolation(source, translated);
	if (!violation) return null;

	return {
		guardId: POST_TRANSLATION_GUARD_IDS.frontmatterPreserved,
		message: "Frontmatter lost during translation",
		retryHint:
			"Keep the leading YAML frontmatter block (`---` delimiters and keys) intact. Only translate allowed string values per the rules; never remove the frontmatter block.",
	};
};
