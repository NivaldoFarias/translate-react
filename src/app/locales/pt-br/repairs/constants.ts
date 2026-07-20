import type { LocalePhraseReplacementGroup, LocaleRegexRepair } from "../../repairs/types";

/** Regex repairs for Brazilian Portuguese (none validated in production yet) */
export const ptBrRegexRepairs = [] as const satisfies readonly LocaleRegexRepair[];

/** Literal phrase replacement tables for Brazilian Portuguese (none validated yet) */
export const ptBrPhraseReplacementGroups =
	[] as const satisfies readonly LocalePhraseReplacementGroup[];
