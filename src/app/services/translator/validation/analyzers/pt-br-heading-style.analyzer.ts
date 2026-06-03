import {
	PT_BR_HEADING_PROPER_NOUN_ALLOWLIST,
	PT_BR_HEADING_WORDS_EXPECTED_LOWERCASE,
} from "@/app/constants/pt-br-heading-style.constants";

/** A pt-br heading that uses English-style Title Case incorrectly */
export interface PtBrHeadingStyleViolation {
	/** Full heading line (hash marks and title) */
	readonly heading: string;

	/** Word that should use sentence case */
	readonly word: string;
}

/** Matches ATX headings `## Title` */
const HEADING_LINE = new RegExp(/^(?<hashes>#{1,6})\s+(?<title>.+)$/gm);

/** Removes trailing JSX slug comment from a heading title */
const HEADING_SLUG_COMMENT = new RegExp(/\s*\{\/\*[^*]+\*\/\}\s*$/);

/** Splits a heading title into word tokens */
const HEADING_WORD = new RegExp(/\b[\p{L}][\p{L}\p{M}'-]*/gu);

/**
 * Finds pt-br headings that capitalize common words after the first (Title Case drift).
 *
 * @param translatedMarkdown Translated markdown to validate
 *
 * @returns Violations with heading context and offending word
 */
export function findPtBrHeadingSentenceCaseViolations(translatedMarkdown: string) {
	const violations: PtBrHeadingStyleViolation[] = [];

	for (const match of translatedMarkdown.matchAll(HEADING_LINE)) {
		const hashes = match.groups?.["hashes"];
		const rawTitle = match.groups?.["title"];
		if (!hashes || !rawTitle) continue;

		const title = rawTitle.replace(HEADING_SLUG_COMMENT, "").trim();
		const words = [...title.matchAll(HEADING_WORD)].map((wordMatch) => wordMatch[0]);

		for (let index = 1; index < words.length; index++) {
			const word = words[index];
			if (!word || !isTitleCaseWord(word)) continue;

			const lower = word.toLocaleLowerCase("pt-BR");
			if (PT_BR_HEADING_PROPER_NOUN_ALLOWLIST.has(lower)) continue;
			if (!isPortugueseHeadingWord(word, lower)) continue;

			violations.push({
				heading: `${hashes} ${title}`,
				word,
			});
		}
	}

	return violations;
}

/**
 * Builds a retry hint for pt-br heading sentence-case violations.
 *
 * @param violations Detected heading style problems
 *
 * @returns Hint string for the LLM system prompt
 */
export function buildPtBrHeadingSentenceCaseRetryHint(
	violations: readonly PtBrHeadingStyleViolation[],
) {
	const examples = violations
		.slice(0, 4)
		.map(({ heading, word }) => `in \`${heading}\`, use sentence case for "${word}"`)
		.join("; ");

	return `Use Portuguese sentence case in headings: capitalize only the first word and proper nouns (React, JSX, product names). ${examples}.`;
}

/**
 * Reports whether a token uses initial cap with lowercase remainder (Title Case).
 *
 * @param word Heading word token
 *
 * @returns `true` when the word looks Title Cased
 */
function isTitleCaseWord(word: string) {
	if (word.length < 2) return false;
	if (word === word.toUpperCase()) return false;

	return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{Ll}\p{M}-]+$/u.test(word);
}

/**
 * Reports whether a capitalized word is likely Portuguese heading prose.
 *
 * @param word Original token from the heading
 * @param lower Lowercased token for dictionary lookup
 *
 * @returns `true` when the word should follow sentence-case rules
 */
function isPortugueseHeadingWord(word: string, lower: string) {
	if (/[áéíóúâêôãõç]/i.test(word)) return true;

	return PT_BR_HEADING_WORDS_EXPECTED_LOWERCASE.has(lower);
}
