import type { LocaleMechanicalRepairsDefinition } from "../../repairs/types";

import { createLocaleMechanicalRepairs } from "../../repairs/repairs.factory";

import { ptBrPhraseReplacementGroups, ptBrRegexRepairs } from "./constants";

/** Declarative Brazilian Portuguese locale mechanical repair definition */
export const ptBrMechanicalRepairsDefinition = {
	localeId: "pt-br",
	phraseGroups: ptBrPhraseReplacementGroups,
	regexRepairs: ptBrRegexRepairs,
	passes: [],
} as const satisfies LocaleMechanicalRepairsDefinition;

/** Brazilian Portuguese locale mechanical repair handle (identity until prod-validated repairs land) */
export const ptBrLocaleMechanicalRepairs = createLocaleMechanicalRepairs(
	ptBrMechanicalRepairsDefinition,
);
