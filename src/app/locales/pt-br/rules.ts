import type { LocalePromptRuleSection } from "../rules.util";

import { buildLocaleRulesPrompt, segmentBatchContextSection } from "../rules.util";

const ptBrDeprecatedRulesSection: LocalePromptRuleSection = {
	bullets: [
		"ALWAYS translate 'deprecated' and related terms (deprecation, deprecating, deprecates) to 'descontinuado(a)', 'descontinuada', 'obsoleto(a)' or 'obsoleta' in ALL contexts (documentation text, comments, headings, lists, etc.)",
		"Exception: Do NOT translate 'deprecated' in HTML comment IDs like {/*deprecated-something*/} - keep these exactly as-is",
		"Exception: Do NOT translate 'deprecated' in URLs, anchor links, or code variable names",
	],
};

const ptBrMdnUrlRulesSection: LocalePromptRuleSection = {
	bullets: [
		"When a MDN document is referenced, update the language slug to the Brazilian Portuguese version ('https://developer.mozilla.org/<slug>/*' => 'https://developer.mozilla.org/pt-BR/*')",
	],
};

const ptBrFencedCodeRulesSection: LocalePromptRuleSection = {
	heading: "FENCED CODE AND MDX (pt-br.react.dev)",
	bullets: [
		"Inside fenced code blocks: do NOT translate string literals or JSX text used as demo UI copy (labels like `Created at:`, button text, `<h1>` headings in examples). Copy them exactly from the source in English.",
		"Keep React API vocabulary in `//` and `/* */` code comments in English (`state`, `effect`, `ref`, `props`, `reducer`, `dispatch`, `context`, `memo`, `render`, `suspense`, etc.) unless the translation guidelines explicitly map the term.",
		"When you translate a code comment into Portuguese, translate the full comment. Do not mix English words into Portuguese sentences except for official API names from the list above.",
		"<ConsoleLogLine> and similar MDX console output: keep message text in English to match runtime console output; do not localize error strings.",
	],
};

const ptBrTerminologyRulesSection: LocalePromptRuleSection = {
	heading: "TERMINOLOGY (pt-br.react.dev)",
	bullets: [
		'Apply upstream `GLOSSARY.md` terms consistently in every section and chunk (e.g. "reset" → "redefinir", not "resetar"; "troubleshooting" → "Solução de Problemas" with capital P in headings).',
		'"troubleshooting" in headings: use "Solução de Problemas", not "Solução de problemas".',
		'"reset" / "resetting": use "redefinir", never "resetar" or "resetou".',
		'"opt-out" means opting out of a feature: use "desativar" or keep "opt-out"; never "otimizar para fora".',
		'Keep official product names in English when cited: "React Server Components", "React Flight" / "Flight" (never "Voo"), "Effect Event" (prefer "Evento de Effect" or English; never "Evento de Efeito").',
		'Use one Portuguese rendering per English concept in the same file (do not mix "lógica" and "lógica de conexão" for "wiring"; pick one form for "Effect Event" throughout).',
	],
};

const ptBrHeadingRulesSection: LocalePromptRuleSection = {
	heading: "HEADINGS (pt-br.react.dev)",
	bullets: [
		'Use Portuguese sentence case in headings: capitalize only the first word and proper nouns (React, JSX, DOM, product names). Do not use English Title Case on common words (e.g. "Novos recursos do React", not "Novos Recursos do React").',
		"Preserve every markdown link as `[label](same-url)` with balanced brackets; translate link text inside brackets only.",
	],
};

const ptBrFullDocumentSections = [
	ptBrDeprecatedRulesSection,
	ptBrMdnUrlRulesSection,
	ptBrFencedCodeRulesSection,
	ptBrTerminologyRulesSection,
	ptBrHeadingRulesSection,
] as const satisfies readonly LocalePromptRuleSection[];

const ptBrSegmentDocumentSections = [
	segmentBatchContextSection,
	ptBrDeprecatedRulesSection,
	ptBrFencedCodeRulesSection,
	ptBrTerminologyRulesSection,
	ptBrHeadingRulesSection,
] as const satisfies readonly LocalePromptRuleSection[];

/**
 * LLM rules for pt-br.react.dev. Static JSX demo text in fences is also
 * enforced by the `fenceJsxStaticText` post-translation guard.
 *
 * @see {@link https://github.com/NivaldoFarias/translate-react/issues/50}
 */
export const ptBrSpecificRules = buildLocaleRulesPrompt(
	"PORTUGUESE (BRAZIL) SPECIFIC RULES",
	ptBrFullDocumentSections,
);

/** Segment and frontmatter batch rules for Brazilian Portuguese locale prompts */
export const ptBrSegmentSpecificRules = buildLocaleRulesPrompt(
	"PORTUGUESE (BRAZIL) SPECIFIC RULES",
	ptBrSegmentDocumentSections,
);

/**
 * Markdown body scope override for pt-br (stricter fenced-code policy than the default locale).
 */
export const ptBrMarkdownTranslationScopeSection = `
				## What to Translate
				- Natural language text and documentation content outside fenced code blocks
				- Alt text, titles, and descriptive content in prose

				## Fenced code blocks and MDX in examples
				- Do NOT translate demo UI strings: quoted literals and JSX text between tags inside fenced code. Copy them exactly from the source.
				- Keep programming identifiers unchanged in every fenced block.
				- For \`//\` and \`/* */\` comments in fenced code, follow the locale-specific fenced-code rules below (React API terms stay in English; translate full comment text when translating).
				- Keep \`<ConsoleLogLine>\` and similar MDX console message text in English to match runtime output.
			`;
