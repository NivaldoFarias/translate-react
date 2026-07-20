import type {
	LocalePhraseReplacement,
	LocalePhraseReplacementGroup,
	LocaleRegexRepair,
	LocaleRegexReplacement,
} from "./types";

import {
	mapMarkdownProseRegions,
	mapOutsideFencedCodeBlocks,
} from "@/app/utils/markdown-verbatim-fences.util";

/**
 * Applies ordered literal replacements to a string slice.
 *
 * @param content Region to transform
 * @param replacements Ordered from/to pairs
 *
 * @returns Region with every `from` literal replaced by `to`
 */
export function applyPhraseReplacements(
	content: string,
	replacements: readonly LocalePhraseReplacement[],
) {
	let cleaned = content;

	for (const [from, to] of replacements) {
		cleaned = cleaned.replaceAll(from, to);
	}

	return cleaned;
}

/**
 * Applies ordered regex replacements to a string slice.
 *
 * @param content Region to transform
 * @param replacements Ordered pattern/replacement pairs
 *
 * @returns Region with every pattern applied in order
 */
export function applyRegexReplacements(
	content: string,
	replacements: readonly LocaleRegexReplacement[],
) {
	let cleaned = content;

	for (const [pattern, replacement] of replacements) {
		cleaned = cleaned.replace(pattern, replacement);
	}

	return cleaned;
}

/**
 * Selects regex repairs by stable id in the requested order.
 *
 * @param repairs Registered regex repair definitions
 * @param ids Repair ids to include
 *
 * @returns Matching repairs in the same order as `ids`
 */
export function selectLocaleRegexRepairs(
	repairs: readonly LocaleRegexRepair[],
	ids: readonly string[],
) {
	return ids.map((id) => {
		const repair = repairs.find((entry) => entry.id === id);

		if (!repair) {
			throw new Error(`Missing locale regex repair: ${id}`);
		}

		return repair;
	});
}

/**
 * Resolves one phrase replacement group by id.
 *
 * @param groups Registered phrase replacement groups
 * @param id Group id to resolve
 *
 * @returns Literal replacements for the requested group
 */
export function getPhraseReplacements(groups: readonly LocalePhraseReplacementGroup[], id: string) {
	const group = groups.find((entry) => entry.id === id);

	if (!group) {
		throw new Error(`Missing locale phrase replacement group: ${id}`);
	}

	return group.replacements;
}

/**
 * Applies named regex repairs in definition order.
 *
 * @param content Region to transform
 * @param repairs Ordered regex repair definitions
 *
 * @returns Region with each repair pattern applied
 */
export function applyLocaleRegexRepairs(content: string, repairs: readonly LocaleRegexRepair[]) {
	let cleaned = content;

	for (const repair of repairs) {
		cleaned = cleaned.replace(repair.pattern, repair.replacement);
	}

	return cleaned;
}

/**
 * Applies every phrase replacement group in order.
 *
 * @param content Region to transform
 * @param groups Named phrase replacement tables
 *
 * @returns Region with all group replacements applied
 */
export function applyPhraseReplacementGroups(
	content: string,
	groups: readonly LocalePhraseReplacementGroup[],
) {
	let cleaned = content;

	for (const group of groups) {
		cleaned = applyPhraseReplacements(cleaned, group.replacements);
	}

	return cleaned;
}

/**
 * Applies phrase replacements only in markdown prose outside fences and inline code.
 *
 * @param content Full markdown document
 * @param replacements Ordered from/to pairs
 *
 * @returns Document with replacements applied to prose regions only
 */
export function applyPhraseReplacementsInProseRegions(
	content: string,
	replacements: readonly LocalePhraseReplacement[],
) {
	return mapMarkdownProseRegions(content, (prose) => applyPhraseReplacements(prose, replacements));
}

/**
 * Applies phrase replacements outside fenced code blocks.
 *
 * @param content Full markdown document
 * @param replacements Ordered from/to pairs
 *
 * @returns Document with replacements applied outside fences
 */
export function applyPhraseReplacementsOutsideFences(
	content: string,
	replacements: readonly LocalePhraseReplacement[],
) {
	return mapOutsideFencedCodeBlocks(content, (region) =>
		applyPhraseReplacements(region, replacements),
	);
}

/**
 * Applies replacements inside markdown link labels only.
 *
 * @param content Markdown prose region
 * @param replacements Ordered pattern/replacement pairs
 *
 * @returns Prose with link label text updated
 */
export function applyReplacementsInMarkdownLinkLabels(
	content: string,
	replacements: readonly LocaleRegexReplacement[],
) {
	return content.replace(/\[([^\]]+)\](?=\()/g, (match, label: string) => {
		let updatedLabel = label;

		for (const [pattern, replacement] of replacements) {
			updatedLabel = updatedLabel.replace(pattern, replacement);
		}

		return `[${updatedLabel}]`;
	});
}

/**
 * Builds a Cyrillic word-boundary regex for a literal Russian lemma.
 *
 * @param word Lemma to match as a standalone word
 *
 * @returns RegExp that matches `word` only when not adjacent to Cyrillic letters
 */
export function cyrillicWordPattern(word: string) {
	return new RegExp(`(?<![а-яёА-ЯЁ])${word}(?![а-яёА-ЯЁ])`, "gu");
}

/**
 * Applies curated ё spellings using Cyrillic word boundaries.
 *
 * @param prose Markdown prose region outside inline code
 * @param replacements Ordered bare-е to ё lemma pairs
 *
 * @returns Prose with validated ё forms restored
 */
export function applyCuratedYoSpellings(
	prose: string,
	replacements: readonly LocalePhraseReplacement[],
) {
	let cleaned = prose;

	for (const [from, to] of replacements) {
		cleaned = cleaned.replace(cyrillicWordPattern(from), to);
	}

	return cleaned;
}
