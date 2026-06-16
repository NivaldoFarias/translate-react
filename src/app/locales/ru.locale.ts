import type { TranslationFile } from "@/app/services/translator/";

import type { LocaleDefinition, LocalePRBodyStrings, ProgressCommentRunContext } from "./types";

import { createPRBodyBuilder } from "./pr-body.builder";

/**
 * Russian strings for the PR body template.
 *
 * Contains all translated text used in the pull request description,
 * following the data-driven approach for locale definitions.
 */
const ruPRBodyStrings: LocalePRBodyStrings = {
	humanReviewNotice:
		"Этот перевод был создан с использованием LLM и **требует проверки человеком** для обеспечения точности, культурного контекста и технической терминологии.",

	conflictNotice: {
		title: "Предыдущий PR закрыт",
		body: (prNumber) =>
			`PR #${prNumber} закрыт автоматически из-за конфликта с основной веткой. Перевод сделан заново по текущему исходному файлу, без ручного разрешения конфликтов из предыдущего PR.`,
	},

	maintainerWikiTip: (wikiUrl) =>
		`См. [For React Docs Maintainers](${wikiUrl}) — руководство для ревьюеров и формат структурированного feedback.`,

	reviewerWarnings: {
		intro:
			"Автоматическая проверка обнаружила механические проблемы, которые нужно исправить вручную перед merge:",
		detailsSummary: "Показать детали проверки",
		guardLabel: (guardId) => {
			const labels: Record<string, string> = {
				markdownLinksPreserved: "Markdown-ссылки",
				fenceFunctionIdentifiers: "Идентификаторы функций в блоках кода",
				fenceJsxStaticText: "Статический JSX-текст в блоках кода",
				headingsPreserved: "Заголовки",
				frontmatterPreserved: "YAML frontmatter",
			};

			return labels[guardId] ?? guardId;
		},
		violationLocation: (startLine, endLine) =>
			startLine === endLine ? `строка ${startLine}` : `строки ${startLine}–${endLine}`,
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
- When a MDN document is referenced, update the language slug to the Russian version ('https://developer.mozilla.org/<slug>/*' => 'https://developer.mozilla.org/ru/*')
- Use formal "вы" (not informal "ты") when addressing the reader
- Preserve English technical terms that are commonly used untranslated in Russian developer communities (e.g., "render", "props", "state", "hook")`,
	},
	pullRequest: {
		title: (file: TranslationFile) => `Перевод \`${file.filename}\` на русский язык`,
		body: createPRBodyBuilder(ruPRBodyStrings),
	},
};
