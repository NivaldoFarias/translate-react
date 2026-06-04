import type { TranslationFile } from "@/app/services/translator/";

import type { LocaleDefinition, LocalePRBodyStrings, ProgressCommentRunContext } from "./types";

import { createPRBodyBuilder } from "./pr-body.builder";

/**
 * Brazilian Portuguese strings for the PR body template.
 *
 * Contains all translated text used in the pull request description,
 * following the data-driven approach for locale definitions.
 */
const ptBrPRBodyStrings: LocalePRBodyStrings = {
	intro: (languageName) =>
		`Este PR contém uma tradução automatizada da página referenciada para **${languageName}**.`,

	conflictNotice: {
		title: "PR anterior fechado",
		body: (prNumber) =>
			`O PR #${prNumber} foi fechado automaticamente por conflito com a branch principal. Esta tradução foi refeita a partir do arquivo fonte atual, sem merge manual dos conflitos do PR anterior.`,
	},

	humanReviewNotice:
		"Esta tradução foi gerada usando LLMs e **requer revisão humana** para garantir precisão, contexto cultural e terminologia técnica.",

	detailsSummary: "Detalhes",

	stats: {
		header: "Estatísticas de Processamento",
		metrics: {
			metricColumn: "Métrica",
			valueColumn: "Valor",
			sourceSize: "Tamanho do Arquivo Fonte",
			translationSize: "Tamanho da Tradução",
			contentRatio: "Razão de Conteúdo",
			processingTime: "Tempo de Processamento",
		},
		notes: {
			contentRatio:
				"`Razão de Conteúdo` indica como o comprimento da tradução se compara à fonte (~1.0x: mesmo comprimento, >1.0x: tradução é mais longa). Valores muito baixos ou altos podem indicar truncamento ou conteúdo incompleto.",
			processingTime:
				"`Tempo de Processamento` baseia-se no cálculo do tempo total desde o início do fluxo até a conclusão da tradução deste arquivo específico.",
		},
	},

	techInfo: {
		header: "Informações Técnicas",
		runnerVersion: "Versão do translate-react",
		translationModel: "Modelo de tradução (LLM)",
		llmApiHost: "Endpoint LLM",
		nodeEnv: "Ambiente (`NODE_ENV`)",
		maskVerbatimLargeFences: "Máscara de blocos de código grandes",
		workflowRun: "Execução do workflow",
	},

	retries: {
		header: "Tentativas de Validação",
		columns: {
			guardColumn: "Validador",
			reasonColumn: "Motivo",
		},
		note: "A tradução precisou de tentativas adicionais para passar nas validações pós-tradução. Os validadores acima detectaram problemas que foram corrigidos automaticamente pelo LLM em tentativas subsequentes.",
	},

	maintainerGuide: (wikiUrl) => `Guia para revisores: [For React Docs Maintainers](${wikiUrl}).`,

	timeFormatLocale: "pt-BR",
};

/**
 * LLM rules for pt-br.react.dev (maintainer review evidence; static JSX demo text in fences is also enforced by the `fenceJsxStaticText` post-translation guard).
 *
 * @see {@link https://github.com/NivaldoFarias/translate-react/issues/50}
 */
const PT_BR_SPECIFIC_RULES = `
# PORTUGUESE (BRAZIL) SPECIFIC RULES
- ALWAYS translate 'deprecated' and related terms (deprecation, deprecating, deprecates) to 'descontinuado(a)', 'descontinuada', 'obsoleto(a)' or 'obsoleta' in ALL contexts (documentation text, comments, headings, lists, etc.)
	- Exception: Do NOT translate 'deprecated' in HTML comment IDs like {/*deprecated-something*/} - keep these exactly as-is
	- Exception: Do NOT translate 'deprecated' in URLs, anchor links, or code variable names
- When a MDN document is referenced, update the language slug to the Brazilian Portuguese version ('https://developer.mozilla.org/<slug>/*' => 'https://developer.mozilla.org/pt-BR/*')

## FENCED CODE AND MDX (pt-br.react.dev)
- Inside fenced code blocks: do NOT translate string literals or JSX text used as demo UI copy (labels like \`Created at:\`, button text, \`<h1>\` headings in examples). Copy them exactly from the source in English.
- Keep React API vocabulary in \`//\` and \`/* */\` code comments in English (\`state\`, \`effect\`, \`ref\`, \`props\`, \`reducer\`, \`dispatch\`, \`context\`, \`memo\`, \`render\`, \`suspense\`, etc.) unless the translation guidelines explicitly map the term.
- When you translate a code comment into Portuguese, translate the full comment. Do not mix English words into Portuguese sentences except for official API names from the list above.
- \`<ConsoleLogLine>\` and similar MDX console output: keep message text in English to match runtime console output; do not localize error strings.

## TERMINOLOGY (pt-br.react.dev)
- Apply upstream \`GLOSSARY.md\` terms consistently in every section and chunk (e.g. "reset" → "redefinir", not "resetar"; "troubleshooting" → "Solução de Problemas" with capital P in headings).
- "troubleshooting" in headings: use "Solução de Problemas", not "Solução de problemas".
- "reset" / "resetting": use "redefinir", never "resetar" or "resetou".
- "opt-out" means opting out of a feature: use "desativar" or keep "opt-out"; never "otimizar para fora".
- Keep official product names in English when cited: "React Server Components", "React Flight" / "Flight" (never "Voo"), "Effect Event" (prefer "Evento de Effect" or English; never "Evento de Efeito").
- Use one Portuguese rendering per English concept in the same file (do not mix "lógica" and "lógica de conexão" for "wiring"; pick one form for "Effect Event" throughout).

## HEADINGS (pt-br.react.dev)
- Use Portuguese sentence case in headings: capitalize only the first word and proper nouns (React, JSX, DOM, product names). Do not use English Title Case on common words (e.g. "Novos recursos do React", not "Novos Recursos do React").
- Preserve every markdown link as \`[label](same-url)\` with balanced brackets; translate link text inside brackets only.`;

/**
 * Markdown body scope override for pt-br (stricter fenced-code policy than the default locale).
 */
const PT_BR_MARKDOWN_TRANSLATION_SCOPE = `
				## What to Translate
				- Natural language text and documentation content outside fenced code blocks
				- Alt text, titles, and descriptive content in prose

				## Fenced code blocks and MDX in examples
				- Do NOT translate demo UI strings: quoted literals and JSX text between tags inside fenced code. Copy them exactly from the source.
				- Keep programming identifiers unchanged in every fenced block.
				- For \`//\` and \`/* */\` comments in fenced code, follow the locale-specific fenced-code rules below (React API terms stay in English; translate full comment text when translating).
				- Keep \`<ConsoleLogLine>\` and similar MDX console message text in English to match runtime output.
			`;

/**
 * Brazilian Portuguese locale definition.
 *
 * Contains all Portuguese (Brazil) specific user-facing texts
 * and LLM translation rules for the `pt-br.react.dev` documentation.
 */
export const ptBrLocale: LocaleDefinition = {
	comment: {
		prefix: (runContext?: ProgressCommentRunContext) => {
			if (!runContext) {
				return "As seguintes páginas foram traduzidas nesta execução:";
			}

			return `A [última execução](${runContext.url}) do [\`translate-react@${runContext.version}\`](${runContext.releaseUrl}) concluiu estas traduções[^1]:`;
		},
		createdSectionHeader: "### PRs criados",
		updatedSectionHeader: "### PRs atualizados",
		suffix: `[^1]: as traduções foram geradas por uma LLM e requerem revisão humana para garantir precisão técnica e fluência.`,
	},
	rules: {
		specific: PT_BR_SPECIFIC_RULES,
		markdownTranslationScopeSection: PT_BR_MARKDOWN_TRANSLATION_SCOPE,
	},
	pullRequest: {
		title: (file: TranslationFile) => `Tradução de \`${file.filename}\` para Português (Brasil)`,
		body: createPRBodyBuilder(ptBrPRBodyStrings),
	},
};
