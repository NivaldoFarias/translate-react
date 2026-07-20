import { RU_MECHANICAL_REPAIR_PASS_IDS, ruLocaleMechanicalRepairs } from "./definition";

/**
 * Collapses duplicated Russian `С помощью` lead-ins before a comma after `'use client'`.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with duplicated Russian lead-ins removed
 */
export function collapseDuplicatedRuUseClientLeadIn(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(
		RU_MECHANICAL_REPAIR_PASS_IDS.duplicatedUseClientLeadIn,
		content,
	);
}

/**
 * Repairs common Russian `_output_` emphasis corruption and removes duplicated trailing clauses.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with restored `HTML- _вывод_` emphasis and no duplicated output clause
 */
export function repairCorruptedRuOutputEmphasis(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(
		RU_MECHANICAL_REPAIR_PASS_IDS.corruptedOutputEmphasis,
		content,
	);
}

/**
 * Repairs duplicated Russian negation emphasis glitches such as `не _не_ имеет`.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with a single `_не_` emphasis marker restored
 */
export function repairDuplicatedRuNegationEmphasis(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(
		RU_MECHANICAL_REPAIR_PASS_IDS.duplicatedNegationEmphasis,
		content,
	);
}

/**
 * Repairs RichTextEditor dependency phrasing so only `formatDate` and `Button` are named as dependencies.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with corrected RichTextEditor dependency wording
 */
export function repairRuRichTextEditorDependencyPhrase(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(
		RU_MECHANICAL_REPAIR_PASS_IDS.richTextEditorDependencyPhrase,
		content,
	);
}

/**
 * Repairs `'use client'` directive suffix artifacts such as `-директиву`.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with natural Russian directive phrasing restored
 */
export function repairRuUseClientDirectiveSuffixArtifacts(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(
		RU_MECHANICAL_REPAIR_PASS_IDS.useClientDirectiveSuffix,
		content,
	);
}

/**
 * Repairs ambiguous Counter / CounterContainer parent-component phrasing.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with disambiguated parent-component wording
 */
export function repairRuCounterParentComponentPhrasing(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(
		RU_MECHANICAL_REPAIR_PASS_IDS.counterParentComponentPhrasing,
		content,
	);
}

/**
 * Replaces prod-validated Russian calque phrases outside fenced code blocks.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with known calque phrases normalized
 */
export function replaceKnownRuCalquePhrases(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(RU_MECHANICAL_REPAIR_PASS_IDS.calquePhrases, content);
}

/**
 * Replaces common English loanword leaks in Russian prose outside fenced and inline code.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with validated English-to-Russian prose phrase fixes applied
 */
export function replaceRuEnglishProseLeaks(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(
		RU_MECHANICAL_REPAIR_PASS_IDS.englishProseLeaks,
		content,
	);
}

/**
 * Repairs React Server Components app calques after generic Server/Client swaps.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with natural RSC app phrasing restored
 */
export function repairRuReactServerComponentsAppCalques(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(RU_MECHANICAL_REPAIR_PASS_IDS.rscAppCalques, content);
}

/**
 * Repairs broken FancyText output phrasing from maintainer feedback on PR #1173.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with corrected FancyText output tense and wording
 */
export function repairRuFancyTextOutputPhrasing(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(
		RU_MECHANICAL_REPAIR_PASS_IDS.fancyTextOutputPhrasing,
		content,
	);
}

/**
 * Rewrites English Server/Client Component terms to lowercase Russian prose equivalents.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with Server/Client Component terminology localized in prose
 */
export function replaceEnglishServerClientComponentTerms(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(
		RU_MECHANICAL_REPAIR_PASS_IDS.serverClientTerms,
		content,
	);
}

/**
 * Applies a curated whitelist of ё spellings outside fenced and inline code.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with validated ё forms restored
 */
export function applyCuratedRuYoSpellings(content: string) {
	return ruLocaleMechanicalRepairs.applyPass(RU_MECHANICAL_REPAIR_PASS_IDS.yoSpellings, content);
}

/**
 * Applies Russian locale mechanical repairs validated on production translation feedback.
 *
 * @param content Assembled translated markdown
 *
 * @returns Document with Russian-specific LLM glitch patterns repaired
 */
export function applyRuLocaleMechanicalRepairs(content: string) {
	return ruLocaleMechanicalRepairs.apply(content);
}
