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
	intro: (languageName) =>
		`Этот PR содержит автоматический перевод указанной страницы на **${languageName}**.`,

	conflictNotice: {
		title: "Предыдущий PR закрыт",
		body: (prNumber) =>
			`PR #${prNumber} закрыт автоматически из-за конфликта с основной веткой. Перевод сделан заново по текущему исходному файлу, без ручного разрешения конфликтов из предыдущего PR.`,
	},

	humanReviewNotice:
		"Этот перевод был создан с использованием LLM и **требует проверки человеком** для обеспечения точности, культурного контекста и технической терминологии.",

	detailsSummary: "Подробности",

	stats: {
		header: "Статистика обработки",
		metrics: {
			metricColumn: "Метрика",
			valueColumn: "Значение",
			sourceSize: "Размер исходного файла",
			translationSize: "Размер перевода",
			contentRatio: "Соотношение контента",
			processingTime: "Время обработки",
		},
		notes: {
			contentRatio:
				"`Соотношение контента` показывает, как длина перевода соотносится с исходником (~1.0x: одинаковая длина, >1.0x: перевод длиннее). Слишком низкие или высокие значения могут указывать на усечение или неполный перевод.",
			processingTime:
				"`Время обработки` рассчитывается как общее время от начала процесса до завершения перевода этого конкретного файла.",
		},
	},

	techInfo: {
		header: "Техническая информация",
		runnerVersion: "Версия translate-react",
		translationModel: "Модель перевода (LLM)",
		llmApiHost: "LLM endpoint",
		nodeEnv: "Окружение (`NODE_ENV`)",
		maskVerbatimLargeFences: "Маскировка больших блоков кода",
		workflowRun: "Запуск workflow",
	},

	retries: {
		header: "Попытки валидации",
		columns: {
			guardColumn: "Валидатор",
			reasonColumn: "Причина",
		},
		note: "Перевод потребовал дополнительных попыток для прохождения пост-переводческих валидаций. Указанные валидаторы обнаружили проблемы, которые были автоматически исправлены LLM в последующих попытках.",
	},

	maintainerGuide: (wikiUrl) =>
		`Руководство для ревьюеров: [For React Docs Maintainers](${wikiUrl}).`,

	timeFormatLocale: "ru-RU",
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
				return "Следующие страницы были переведены и созданы PR:";
			}

			return `[Последний запуск](${runContext.url}) [\`translate-react@${runContext.version}\`](${runContext.releaseUrl}) перевёл следующие страницы и создал эти PR[^1]:`;
		},
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
