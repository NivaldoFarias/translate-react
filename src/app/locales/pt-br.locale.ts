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
 * Brazilian Portuguese locale definition.
 *
 * Contains all Portuguese (Brazil) specific user-facing texts
 * and LLM translation rules for the `pt-br.react.dev` documentation.
 */
export const ptBrLocale: LocaleDefinition = {
	comment: {
		prefix: (runContext?: ProgressCommentRunContext) => {
			if (!runContext) {
				return "As seguintes páginas foram traduzidas e PRs foram criados:";
			}

			return `A [última execução](${runContext.url}) do [\`translate-react@${runContext.version}\`](${runContext.releaseUrl}) traduziu as seguintes páginas e criou estes PRs[^1]:`;
		},
		suffix: `[^1]: as traduções foram geradas por uma LLM e requerem revisão humana para garantir precisão técnica e fluência.`,
	},
	rules: {
		specific: `
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
- Keep official product names in English when cited: "React Server Components", "React Flight" / "Flight" (never "Voo"), "Effect Event" (prefer "Evento de Effect" or English; never "Evento de Efeito").
- "opt-out" means opting out of a feature: use "desativar" or keep "opt-out"; never "otimizar para fora".
- Use one Portuguese rendering per English concept in the same file (do not mix "lógica" and "lógica de conexão" for "wiring").`,
	},
	pullRequest: {
		title: (file: TranslationFile) => `Tradução de \`${file.filename}\` para Português (Brasil)`,
		body: createPRBodyBuilder(ptBrPRBodyStrings),
	},
};
