import type { TranslationFile } from "@/app/services/translator/";

import type { LocaleDefinition, LocalePRBodyStrings, ProgressCommentRunContext } from "../types";

import { createGuardLabelResolver } from "../guard-labels.util";
import { createPRBodyBuilder } from "../pr-body.builder";

import {
	ptBrMarkdownTranslationScopeSection,
	ptBrSegmentSpecificRules,
	ptBrSpecificRules,
} from "./rules";

/** Brazilian Portuguese strings for the PR body template */
const ptBrPRBodyStrings: LocalePRBodyStrings = {
	humanReviewNotice:
		"Esta tradução é um **rascunho** gerado por LLM para contribuidores da documentação. Valide manualmente o conteúdo antes do merge para garantir precisão, contexto cultural e terminologia técnica.\n\nSe encontrar problemas, abra um PR para a branch deste fork ou solicite alterações/comente neste PR.",

	conflictNotice: {
		title: "PR atualizado após conflito",
		body: (prNumber) =>
			`O PR #${prNumber} estava em conflito com a branch principal. A tradução foi refeita a partir do arquivo fonte atual e a branch existente foi atualizada, sem merge manual dos conflitos anteriores.`,
	},

	maintainerWikiTip: (wikiUrl) =>
		`Consulte [For React Docs Maintainers](${wikiUrl}) para orientações de validação manual, revisão e formato de feedback estruturado.`,

	reviewerWarnings: {
		intro:
			"A validação automática detectou problemas mecânicos que precisam de correção manual antes do merge:",
		detailsSummary: "Ver detalhes da validação",
		guardLabel: createGuardLabelResolver({
			markdownLinksPreserved: "Links markdown",
			fenceFunctionIdentifiers: "Identificadores de função em blocos de código",
			fenceJsxStaticText: "Texto JSX estático em blocos de código",
			headingsPreserved: "Títulos",
			frontmatterPreserved: "Frontmatter YAML",
			sentenceCaseHeadings: "Sentence case em títulos",
			mdxSpacing: "Espaçamento MDX",
			extraMarkdownLinks: "Links extras",
			englishServerClientTerms: "Termos Server/Client Component em inglês",
			mdxSlugPreserved: "Slugs MDX",
			headingCountPreserved: "Contagem de títulos",
			headingSyntax: "Sintaxe de títulos",
			contentRatio: "Proporção de conteúdo",
			nonEmptyContent: "Conteúdo vazio",
		}),
		violationTally: (count) => (count === 1 ? "1 violação" : `${count} violações`),
	},
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
				return "As seguintes páginas foram traduzidas nesta execução:";
			}

			return `A [última execução](${runContext.url}) do [\`translate-react@${runContext.version}\`](${runContext.releaseUrl}) concluiu estas traduções[^1]:`;
		},
		createdSectionHeader: "### PRs criados",
		updatedSectionHeader: "### PRs atualizados",
		suffix: `[^1]: as traduções são rascunhos gerados por LLM; valide manualmente antes do merge.`,
	},
	rules: {
		specific: ptBrSpecificRules,
		segmentSpecific: ptBrSegmentSpecificRules,
		markdownTranslationScopeSection: ptBrMarkdownTranslationScopeSection,
	},
	pullRequest: {
		title: (file: TranslationFile) => `Tradução de \`${file.filename}\` para Português (Brasil)`,
		body: createPRBodyBuilder(ptBrPRBodyStrings),
	},
};
