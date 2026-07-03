import type { TranslationFile } from "@/app/services/translator/";

import type { LocaleDefinition, LocalePRBodyStrings, ProgressCommentRunContext } from "./types";

import { createGuardLabelResolver } from "./locale-guard-labels.util";
import { createPRBodyBuilder } from "./pr-body.builder";

/** Russian strings for the PR body template */
const ruPRBodyStrings: LocalePRBodyStrings = {
	humanReviewNotice:
		"Этот перевод был создан с использованием LLM и **требует проверки человеком** для обеспечения точности, культурного контекста и технической терминологии.",

	conflictNotice: {
		title: "PR обновлён после конфликта",
		body: (prNumber) =>
			`PR #${prNumber} был в конфликте с основной веткой. Перевод сделан заново по текущему исходному файлу, а существующая ветка обновлена, без ручного разрешения предыдущих конфликтов.`,
	},

	maintainerWikiTip: (wikiUrl) =>
		`См. [For React Docs Maintainers](${wikiUrl}): руководство для ревьюеров и формат структурированного feedback.`,

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
		suffix: `[^1]: переводы были сгенерированы с использованием LLM и требуют проверки человеком для обеспечения точности, культурного контекста и технической терминологии.`,
	},
	rules: {
		specific: `
# RUSSIAN SPECIFIC RULES
- ALWAYS translate 'deprecated' and related terms (deprecation, deprecating, deprecates) to 'устаревший', 'устаревшее', 'устаревшая' or appropriate forms in ALL contexts (documentation text, comments, headings, lists, etc.)
	- Exception: Do NOT translate 'deprecated' in HTML comment IDs like {/*deprecated-something*/} - keep these exactly as-is
	- Exception: Do NOT translate 'deprecated' in URLs, anchor links, or code variable names
- When a MDN document is referenced, update the language slug to the Russian version for that specific page ('https://developer.mozilla.org/en-US/docs/...' => 'https://developer.mozilla.org/ru/docs/...'), including built-in type references such as String, Array, Map, Set, Date, and Promise
- Use formal "вы" (not informal "ты") when addressing the reader
- Preserve English technical terms that are commonly used untranslated in Russian developer communities (e.g., "render", "props", "state", "hook")
- ALWAYS use the letter 'ё' where standard Russian spelling requires it (e.g. 'определён', 'объём', 'жёлтый', 'начнёт'), not the substitute 'е'
- ALWAYS use Russian guillemets («») for quotation marks, never straight double quotes (")
- Translate 'bundler' as 'бандлер', not 'сборщик'
- Use lowercase for 'серверные компоненты' (Server Components) and 'клиентские компоненты' (Client Components), consistent with other compound terms like 'дочерний компонент' and 'классовый компонент'; do not capitalize each word or use 'Компонент Сервера' / 'Компонент Клиента'`,
	},
	pullRequest: {
		title: (file: TranslationFile) => `Перевод \`${file.filename}\` на русский язык`,
		body: createPRBodyBuilder(ruPRBodyStrings),
	},
};
