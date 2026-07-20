import type { TranslationFile } from "@/app/services/translator/";

import type { LocaleDefinition, LocalePRBodyStrings, ProgressCommentRunContext } from "../types";

import { createGuardLabelResolver } from "../guard-labels.util";
import { createPRBodyBuilder } from "../pr-body.builder";

import { ruSegmentSpecificRules, ruSpecificRules } from "./rules";

/** Russian strings for the PR body template */
const ruPRBodyStrings: LocalePRBodyStrings = {
	humanReviewNotice:
		"Этот перевод — **черновик**, созданный LLM для контрибьюторов документации. Проверьте содержимое вручную перед merge, чтобы обеспечить точность, культурный контекст и техническую терминологию.\n\nЕсли найдёте проблемы, откройте PR в ветку на форке или запросите правки/оставьте комментарий в этом PR.",

	conflictNotice: {
		title: "PR обновлён после конфликта",
		body: (prNumber) =>
			`PR #${prNumber} был в конфликте с основной веткой. Перевод сделан заново по текущему исходному файлу, а существующая ветка обновлена, без ручного разрешения предыдущих конфликтов.`,
	},

	maintainerWikiTip: (wikiUrl) =>
		`См. [For React Docs Maintainers](${wikiUrl}): руководство по ручной проверке, ревью и формату структурированного feedback.`,

	reviewerWarnings: {
		intro:
			"Автоматическая проверка обнаружила механические проблемы, которые нужно исправить вручную перед merge:",
		detailsSummary: "Показать детали проверки",
		guardLabel: createGuardLabelResolver({
			markdownLinksPreserved: "Markdown-ссылки",
			fenceFunctionIdentifiers: "Идентификаторы функций в блоках кода",
			fenceJsxStaticText: "Статический JSX-текст в блоках кода",
			headingsPreserved: "Заголовки",
			frontmatterPreserved: "YAML frontmatter",
			sentenceCaseHeadings: "Sentence case в заголовках",
			mdxSpacing: "Интервалы MDX",
			extraMarkdownLinks: "Лишние ссылки",
			englishServerClientTerms: "Английские Server/Client Component",
			mdxSlugPreserved: "MDX-slug",
			headingCountPreserved: "Количество заголовков",
			headingSyntax: "Синтаксис заголовков",
			contentRatio: "Соотношение объёма текста",
			nonEmptyContent: "Пустой перевод",
		}),
		violationTally: (count) => {
			const mod10 = count % 10;
			const mod100 = count % 100;

			if (mod10 === 1 && mod100 !== 11) {
				return `${count} нарушение`;
			}

			if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
				return `${count} нарушения`;
			}

			return `${count} нарушений`;
		},
	},
};

/**
 * Russian locale definition.
 *
 * Contains all Russian specific user-facing texts
 * and LLM translation rules for the `ru.react.dev` documentation.
 */
export const ruLocale: LocaleDefinition = {
	comment: {
		prefix: (runContext?: ProgressCommentRunContext) => {
			if (!runContext) {
				return "Следующие страницы были переведены в этом запуске:";
			}

			return `[Последний запуск](${runContext.url}) [\`translate-react@${runContext.version}\`](${runContext.releaseUrl}) завершил переводы в этом запуске[^1]:`;
		},
		createdSectionHeader: "### Созданные PR",
		updatedSectionHeader: "### Обновлённые PR",
		suffix: `[^1]: переводы — черновики, созданные LLM; проверьте вручную перед merge.`,
	},
	rules: {
		specific: ruSpecificRules,
		segmentSpecific: ruSegmentSpecificRules,
	},
	pullRequest: {
		title: (file: TranslationFile) => `Перевод \`${file.filename}\` на русский язык`,
		body: createPRBodyBuilder(ruPRBodyStrings),
	},
};
