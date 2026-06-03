import type {
	ProtectedEnglishTermRule,
	TerminologyConsistencyRule,
	TerminologyEnforcementRule,
} from "@/app/services/translator/validation/analyzers/terminology.types";

/**
 * pt-br terminology rules beyond upstream glossary tables (maintainer review evidence).
 *
 * @see {@link https://github.com/NivaldoFarias/translate-react/issues/47}
 */
export const PT_BR_TERMINOLOGY_ENFORCEMENT_RULES: readonly TerminologyEnforcementRule[] = [
	{
		sourcePattern: new RegExp(/\btroubleshooting\b/i),
		forbiddenInTranslation: [new RegExp(/\bSolução de problemas\b/)],
		preferredTranslation: "Solução de Problemas",
		glossaryHint:
			'Glossary: "troubleshooting" → "solução de problemas"; use title case "Solução de Problemas" in headings.',
	},
	{
		sourcePattern: new RegExp(/\breset(?:s|ting|ted)?\b/i),
		forbiddenInTranslation: [new RegExp(/\bresetar\b/i), new RegExp(/\bresetou\b/i)],
		preferredTranslation: "redefinir",
		glossaryHint: 'Use "redefinir" for "reset"; do not use "resetar".',
	},
	{
		sourcePattern: new RegExp(/\bopt(?:ing)?-out\b/i),
		forbiddenInTranslation: [new RegExp(/otimizar para fora/i)],
		preferredTranslation: "desativar (opt-out)",
		glossaryHint:
			'"opt-out" means opting out of a feature; use "desativar" or keep "opt-out", not "otimizar para fora".',
	},
];

/**
 * Official React product names that must stay in English in pt-br docs when cited in source.
 */
export const PT_BR_PROTECTED_ENGLISH_TERMS: readonly ProtectedEnglishTermRule[] = [
	{
		term: "React Server Components",
		sourcePattern: new RegExp(/\bReact Server Components\b/),
		forbiddenLiteralTranslations: [
			new RegExp(/Componentes de Servidor React/i),
			new RegExp(/Componentes do Servidor React/i),
		],
	},
	{
		term: "Flight",
		sourcePattern: new RegExp(/\b(?:React )?Flight\b/i),
		requireVerbatimEnglish: false,
		forbiddenLiteralTranslations: [new RegExp(/\bVoo\b/)],
	},
	{
		term: "Effect Event",
		sourcePattern: new RegExp(/\bEffect Events?\b/),
		requireVerbatimEnglish: false,
		forbiddenLiteralTranslations: [new RegExp(/Eventos? de Efeito/i)],
	},
];

/**
 * Intra-document consistency rules for repeated English anchors (chunk-boundary drift).
 */
export const PT_BR_TERMINOLOGY_CONSISTENCY_RULES: readonly TerminologyConsistencyRule[] = [
	{
		sourcePattern: new RegExp(/\bwiring\b/i),
		conflictingForms: ["lógica de conexão", "lógica"],
		glossaryHint:
			'Pick one rendering for "wiring" in this file (e.g. always "lógica de conexão" or always "lógica").',
	},
	{
		sourcePattern: new RegExp(/\bEffect Events?\b/),
		conflictingForms: [
			"Evento de Effect",
			"Evento de Efeito",
			"Eventos de Effect",
			"Eventos de Efeito",
		],
		glossaryHint:
			'Use one form for "Effect Event" throughout (prefer "Evento de Effect" or keep "Effect Event").',
	},
];
