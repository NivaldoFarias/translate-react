import type { TranslationFile } from "@/services/translator/translator.service";

import type { LocaleDefinition, LocalePRBodyStrings } from "./locale.types";

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
		body: (prNumber, mergeableState) =>
			`O PR #${prNumber} foi **fechado automaticamente** devido a conflitos de merge com a branch principal (\`mergeable_state: ${mergeableState}\`).`,
		rewriteExplanation:
			"Esta é uma **tradução completamente nova** baseada na versão mais atual do arquivo fonte. A abordagem de reescrita completa (ao invés de resolução de conflitos baseada em diff) garante consistência e qualidade da tradução.",
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
			filePath: "Caminho do Arquivo",
			processingTime: "Tempo de Processamento",
		},
		notes: [
			'"Razão de Conteúdo" indica como o comprimento da tradução se compara à fonte (~1.0x: mesmo comprimento, >1.0x: tradução é mais longa). Diferentes idiomas naturalmente têm níveis variados de verbosidade.',
			'"Tempo de Processamento" baseia-se no cálculo do tempo total desde o início do fluxo até a conclusão da tradução deste arquivo específico.',
		],
	},

	techInfo: {
		header: "Informações Técnicas",
		generationDate: "Data de Geração",
		branch: "Branch",
	},

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
		prefix: "As seguintes páginas foram traduzidas e PRs foram criados:",
		suffix: `> [!IMPORTANT]
>
> As traduções foram geradas por uma LLM e requerem revisão humana para garantir precisão técnica e fluência.
> Esta implementação é um trabalho em progresso e pode apresentar inconsistências em conteúdos técnicos complexos ou formatação específica.`,
	},
	rules: {
		specific: `
# PORTUGUESE (BRAZIL) SPECIFIC RULES
- ALWAYS translate 'deprecated' and related terms (deprecation, deprecating, deprecates) to 'descontinuado(a)', 'descontinuada', 'obsoleto(a)' or 'obsoleta' in ALL contexts (documentation text, comments, headings, lists, etc.)
	- Exception: Do NOT translate 'deprecated' in HTML comment IDs like {/*deprecated-something*/} - keep these exactly as-is
	- Exception: Do NOT translate 'deprecated' in URLs, anchor links, or code variable names
- When a MDN document is referenced, update the language slug to the Brazilian Portuguese version ('https://developer.mozilla.org/<slug>/*' => 'https://developer.mozilla.org/pt-BR/*')`,
	},
	pullRequest: {
		title: (file: TranslationFile) =>
			`Tradução de ${file.title ? `**${file.title}**` : `\`${file.filename}\``} para Português (Brasil)`,
		body: createPRBodyBuilder(ptBrPRBodyStrings),
	},
};
