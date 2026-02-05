import type { TranslationFile } from "@/services/translator/translator.service";

import type { LocaleDefinition, LocalePRBodyStrings } from "./locale.types";

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
		body: (prNumber, mergeableState) =>
			`PR #${prNumber} был **автоматически закрыт** из-за конфликтов слияния с основной веткой (\`mergeable_state: ${mergeableState}\`).`,
		rewriteExplanation:
			"Это **полностью новый перевод**, основанный на актуальной версии исходного файла. Подход полной перезаписи (вместо разрешения конфликтов на основе diff) обеспечивает согласованность и качество перевода.",
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
			filePath: "Путь к файлу",
			processingTime: "Время обработки",
		},
		notes: [
			'"Соотношение контента" показывает, как длина перевода соотносится с исходником (~1.0x: одинаковая длина, >1.0x: перевод длиннее). Разные языки естественно имеют разный уровень многословности.',
			'"Время обработки" рассчитывается как общее время от начала процесса до завершения перевода этого конкретного файла.',
		],
	},

	techInfo: {
		header: "Техническая информация",
		generationDate: "Дата генерации",
		branch: "Ветка",
	},

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
		prefix: "Следующие страницы были переведены и созданы PR:",
		suffix: `> [!IMPORTANT]
>
> Переводы были созданы с помощью LLM и требуют проверки человеком для обеспечения технической точности и беглости.
> Эта реализация находится в процессе разработки и может содержать несоответствия в сложном техническом контенте или специфическом форматировании.`,
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
