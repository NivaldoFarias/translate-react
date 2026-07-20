import type { LocaleMechanicalRepairsDefinition } from "../../repairs/types";

import {
	createLocaleMechanicalRepairs,
	createPhraseGroupPass,
	createRegexRepairPass,
	createServerClientTermsPass,
	createYoSpellingPass,
} from "../../repairs/repairs.factory";

import {
	ruEnglishServerClientComponentReplacements,
	ruEnglishServerClientLinkLabelReplacements,
	ruPhraseReplacementGroups,
	ruRegexRepairs,
} from "./constants";

/** Stable pass ids for Russian locale mechanical repairs */
export const RU_MECHANICAL_REPAIR_PASS_IDS = {
	duplicatedUseClientLeadIn: "duplicatedUseClientLeadIn",
	corruptedOutputEmphasis: "corruptedOutputEmphasis",
	duplicatedNegationEmphasis: "duplicatedNegationEmphasis",
	useClientDirectiveSuffix: "useClientDirectiveSuffix",
	counterParentComponentPhrasing: "counterParentComponentPhrasing",
	richTextEditorDependencyPhrase: "richTextEditorDependencyPhrase",
	calquePhrases: "calquePhrases",
	englishProseLeaks: "englishProseLeaks",
	serverClientTerms: "serverClientTerms",
	rscAppCalques: "rscAppCalques",
	fancyTextOutputPhrasing: "fancyTextOutputPhrasing",
	yoSpellings: "yoSpellings",
} as const;

/** Declarative Russian locale mechanical repair definition */
export const ruMechanicalRepairsDefinition = {
	localeId: "ru",
	phraseGroups: ruPhraseReplacementGroups,
	regexRepairs: ruRegexRepairs,
	passes: [
		createRegexRepairPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.duplicatedUseClientLeadIn,
			description: "Collapses duplicated Russian lead-in before a comma after `'use client'`",
			repairIds: ["duplicatedUseClientLeadIn"],
			regexRepairs: ruRegexRepairs,
		}),
		createRegexRepairPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.corruptedOutputEmphasis,
			description: "Repairs `_output_` emphasis corruption and duplicated trailing clauses",
			repairIds: ["corruptedOutputClauseDuplicate", "droppedOutputEmphasisAfterComponent"],
			regexRepairs: ruRegexRepairs,
		}),
		createRegexRepairPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.duplicatedNegationEmphasis,
			description: "Collapses duplicated negation emphasis glitches such as `не _не_`",
			repairIds: ["duplicatedNegationEmphasis"],
			regexRepairs: ruRegexRepairs,
		}),
		createRegexRepairPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.useClientDirectiveSuffix,
			description: "Rewrites `'use client' -директив*` suffix artifacts",
			repairIds: ["useClientDirectiveSuffixDative", "useClientDirectiveSuffixInstrumental"],
			regexRepairs: ruRegexRepairs,
		}),
		createRegexRepairPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.counterParentComponentPhrasing,
			description: "Disambiguates Counter / CounterContainer parent-component phrasing",
			repairIds: ["counterParentComponentPhrasing"],
			regexRepairs: ruRegexRepairs,
		}),
		createRegexRepairPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.richTextEditorDependencyPhrase,
			description: "Repairs RichTextEditor dependency phrasing and participial comma placement",
			repairIds: ["richTextEditorDependencyList", "richTextEditorMissingComma"],
			regexRepairs: ruRegexRepairs,
		}),
		createPhraseGroupPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.calquePhrases,
			description: "Replaces prod-validated Russian calque phrases outside fenced code",
			groupId: "calques",
			phraseGroups: ruPhraseReplacementGroups,
			scope: "outside-fences",
			beforeApply: (region) => region.replaceAll("«component»", "«компонент»"),
		}),
		createPhraseGroupPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.englishProseLeaks,
			description: "Replaces common English loanword leaks in Russian prose",
			groupId: "englishProseLeaks",
			phraseGroups: ruPhraseReplacementGroups,
			scope: "prose-regions",
		}),
		createServerClientTermsPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.serverClientTerms,
			description: "Localizes English Server/Client Component terms in prose and link labels",
			phraseGroups: ruPhraseReplacementGroups,
			phraseGroupIds: {
				beforeRegex: "serverClientPhrases",
				afterRegex: "serverClientPostFixes",
			},
			proseRegexReplacements: ruEnglishServerClientComponentReplacements,
			linkLabelRegexReplacements: ruEnglishServerClientLinkLabelReplacements,
		}),
		createPhraseGroupPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.rscAppCalques,
			description: "Repairs React Server Components app noun-stack calques",
			groupId: "rscAppCalques",
			phraseGroups: ruPhraseReplacementGroups,
			scope: "outside-fences",
		}),
		createPhraseGroupPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.fancyTextOutputPhrasing,
			description: "Repairs broken FancyText output tense and HTML-output wording",
			groupId: "fancyTextOutputPhrasing",
			phraseGroups: ruPhraseReplacementGroups,
			scope: "outside-fences",
		}),
		createYoSpellingPass({
			id: RU_MECHANICAL_REPAIR_PASS_IDS.yoSpellings,
			description: "Restores curated ё spellings outside fenced and inline code",
			groupId: "yoSpellings",
			phraseGroups: ruPhraseReplacementGroups,
		}),
	],
} as const satisfies LocaleMechanicalRepairsDefinition;

/** Russian locale mechanical repair handle registered in {@link LOCALE_MECHANICAL_REPAIRS_REGISTRY} */
export const ruLocaleMechanicalRepairs = createLocaleMechanicalRepairs(
	ruMechanicalRepairsDefinition,
);
