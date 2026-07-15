import {
	mapMarkdownProseRegions,
	mapOutsideFencedCodeBlocks,
} from "@/app/utils/markdown-verbatim-fences.util";

/** Matches a duplicated Russian lead-in before a comma after `'use client'` */
const DUPLICATED_RUSSIAN_USE_CLIENT_LEAD_IN = /(С помощью\s+`'use client'`)\s+С помощью\s*,/g;

/**
 * Matches a corrupted duplicated clause after a partial `_output_` emphasis repair failure.
 *
 * ```
 * , _ , а не его исходный код), будет отправлен ...
 * ```
 */
const CORRUPTED_OUTPUT_CLAUSE_DUPLICATE =
	/, _ , а не его исходный код\), будет отправлен в браузер при обращении из серверного компонента\. Как показано в предыдущем примере приложения Inspirations,/g;

/**
 * Matches a component reference followed by a dropped `_output_` emphasis marker.
 *
 * ```
 * `FancyText` вывод _ (а не
 * ```
 */
const DROPPED_OUTPUT_EMPHASIS_AFTER_COMPONENT = /(`\w+`)\s+вывод\s+_\s+\(/g;

/** Matches duplicated negation emphasis glitches such as `не _не_ имеет` */
const DUPLICATED_RU_NEGATION_EMPHASIS = /не _не_/gu;

/**
 * Matches wrong RichTextEditor dependency list phrasing from maintainer feedback.
 *
 * ```
 * В качестве зависимостей `RichTextEditor`, `formatDate` и `Button`
 * ```
 */
const RICH_TEXT_EDITOR_DEPENDENCY_LIST =
	/(?:В качестве зависимостей|Будучи зависимостями|Как зависимости)\s+`RichTextEditor`,\s*`formatDate`\s+и\s+`Button`/gu;

/** Prod-validated Russian calque replacements from maintainer review feedback */
const RU_CALQUE_PHRASE_REPLACEMENTS: readonly (readonly [string, string])[] = [
	["импортированный из помеченного клиента кода", "из кода, помеченного как клиентский"],
	[
		"экспортируемые из помеченного клиента кода",
		"экспортируемые из кода, помеченного как клиентский",
	],
	["совместимые сборщики", "совместимые бандлеры"],
	["Компонент Сервера", "серверный компонент"],
	["Компонент Клиента", "клиентский компонент"],
	["Компоненты Сервера", "серверные компоненты"],
	["Компоненты Клиента", "клиентские компоненты"],
	["Серверный Компонент", "серверный компонент"],
	["Клиентский Компонент", "клиентский компонент"],
];

/** English loanword leaks in otherwise Russian prose */
const RU_ENGLISH_PROSE_LEAK_REPLACEMENTS: readonly (readonly [string, string])[] = [
	["В React app", "В приложении React"],
	["root component", "корневой компонент"],
	["React app", "приложение React"],
	["дерево render", "дерево рендеринга"],
	["дереву render", "дереву рендеринга"],
	["во время render", "во время рендеринга"],
	["Во время render", "Во время рендеринга"],
	["componente", "компонент"],
];

/** Curated ё spellings validated on production Russian translation feedback */
const RU_YO_SPELLING_REPLACEMENTS: readonly (readonly [string, string])[] = [
	["определен", "определён"],
	["объем", "объём"],
	["желтый", "жёлтый"],
	["желтым", "жёлтым"],
	["желтого", "жёлтого"],
	["начнет", "начнёт"],
	["введем", "введём"],
	["уточним", "уточнём"],
	["отрендеренного", "отрендерённого"],
	["отрендеренный", "отрендерённый"],
	["отрендерен", "отрендерён"],
];

/**
 * Builds a Cyrillic word-boundary regex for a literal Russian lemma.
 *
 * @param word Lemma to match as a standalone word
 *
 * @returns RegExp that matches `word` only when not adjacent to Cyrillic letters
 */
function cyrillicWordPattern(word: string) {
	return new RegExp(`(?<![а-яёА-ЯЁ])${word}(?![а-яёА-ЯЁ])`, "gu");
}

/** Prod-validated phrasing fixes before generic Server/Client term swaps */
const RU_SERVER_CLIENT_PHRASE_REPLACEMENTS: readonly (readonly [string, string])[] = [
	["импортируется из Server Component", "импортируется из серверного компонента"],
	["считаются Server Components", "считаются серверными компонентами"],
	["являются Server Components", "являются серверными компонентами"],
	["являются Client Components", "являются клиентскими компонентами"],
	["использование является Client Component", "использование является клиентским компонентом"],
	["использование является Server Component", "использование является серверным компонентом"],
	["элементами Client или Server Component", "элементами клиентского или серверного компонента"],
	[
		"как Server Component, и как Client Component",
		"как серверный компонент, и как клиентский компонент",
	],
];

/** Instrumental-case and agreement fixes after generic Server/Client term swaps */
const RU_SERVER_CLIENT_POST_REPLACEMENTS: readonly (readonly [string, string])[] = [
	[
		"серверными компонентами и клиентские компоненты",
		"серверными компонентами и клиентскими компонентами",
	],
	[
		"серверными компонентами и Client Components",
		"серверными компонентами и клиентскими компонентами",
	],
	["является серверный компонент", "является серверным компонентом"],
	["является клиентский компонент", "является клиентским компонентом"],
	[
		"является серверным компонентом и клиентский компонент",
		"является серверным компонентом и клиентским компонентом",
	],
	[
		"одновременно является серверный компонент и клиентский компонент",
		"одновременно является серверным компонентом и клиентским компонентом",
	],
	["использование является клиентский компонент", "использование является клиентским компонентом"],
	["использование является серверный компонент", "использование является серверным компонентом"],
	["с [серверные компоненты React]", "с [серверными компонентами React]"],
	["с [Серверные компоненты React]", "с [серверными компонентами React]"],
];

/** English Server/Client Component product terms left in Russian prose */
const ENGLISH_SERVER_CLIENT_COMPONENT_REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
	[/React Server Components/gu, "серверные компоненты React"],
	[/Server Components/gu, "серверные компоненты"],
	[/Client Components/gu, "клиентские компоненты"],
	[/Client or Server Component/gu, "клиентский или серверный компонент"],
	[/Server Component/gu, "серверный компонент"],
	[/Client Component/gu, "клиентский компонент"],
];

/** Link-label replacements for Server/Client product terms */
const ENGLISH_SERVER_CLIENT_LINK_LABEL_REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
	[/React Server Components/gu, "серверные компоненты React"],
	[/Server Components/gu, "серверные компоненты"],
	[/Client Components/gu, "клиентские компоненты"],
	[/Server Component/gu, "серверный компонент"],
	[/Client Component/gu, "клиентский компонент"],
];

/**
 * Applies replacements inside markdown link labels only.
 *
 * @param content Markdown prose region
 * @param replacements Ordered pattern/replacement pairs
 *
 * @returns Prose with link label text updated
 */
function applyReplacementsInMarkdownLinkLabels(
	content: string,
	replacements: readonly (readonly [RegExp, string])[],
) {
	return content.replace(/\[([^\]]+)\](?=\()/g, (match, label: string) => {
		let updatedLabel = label;

		for (const [pattern, replacement] of replacements) {
			updatedLabel = updatedLabel.replace(pattern, replacement);
		}

		return `[${updatedLabel}]`;
	});
}

/**
 * Collapses duplicated Russian `С помощью` lead-ins before a comma after `'use client'`.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with duplicated Russian lead-ins removed
 */
export function collapseDuplicatedRuUseClientLeadIn(content: string) {
	return content.replace(DUPLICATED_RUSSIAN_USE_CLIENT_LEAD_IN, "$1,");
}

/**
 * Repairs common Russian `_output_` emphasis corruption and removes duplicated trailing clauses.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with restored `HTML- _вывод_` emphasis and no duplicated output clause
 */
export function repairCorruptedRuOutputEmphasis(content: string) {
	return content
		.replace(DROPPED_OUTPUT_EMPHASIS_AFTER_COMPONENT, "$1 HTML- _вывод_ (")
		.replace(CORRUPTED_OUTPUT_CLAUSE_DUPLICATE, ",");
}

/**
 * Repairs duplicated Russian negation emphasis glitches such as `не _не_ имеет`.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with a single `_не_` emphasis marker restored
 */
export function repairDuplicatedRuNegationEmphasis(content: string) {
	return content.replace(DUPLICATED_RU_NEGATION_EMPHASIS, "_не_");
}

/**
 * Repairs RichTextEditor dependency phrasing so only `formatDate` and `Button` are named as dependencies.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with corrected RichTextEditor dependency wording
 */
export function repairRuRichTextEditorDependencyPhrase(content: string) {
	return mapOutsideFencedCodeBlocks(content, (region) =>
		region.replace(
			RICH_TEXT_EDITOR_DEPENDENCY_LIST,
			"`formatDate` и `Button`, будучи зависимостями `RichTextEditor`",
		),
	);
}

/**
 * Replaces prod-validated Russian calque phrases outside fenced code blocks.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with known calque phrases normalized
 */
export function replaceKnownRuCalquePhrases(content: string) {
	return mapOutsideFencedCodeBlocks(content, (region) => {
		let cleaned = region.replaceAll("«component»", "«компонент»");

		for (const [from, to] of RU_CALQUE_PHRASE_REPLACEMENTS) {
			cleaned = cleaned.replaceAll(from, to);
		}

		return cleaned;
	});
}

/**
 * Replaces common English loanword leaks in Russian prose outside fenced and inline code.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with validated English-to-Russian prose phrase fixes applied
 */
export function replaceRuEnglishProseLeaks(content: string) {
	return mapMarkdownProseRegions(content, (prose) => {
		let cleaned = prose;

		for (const [from, to] of RU_ENGLISH_PROSE_LEAK_REPLACEMENTS) {
			cleaned = cleaned.replaceAll(from, to);
		}

		return cleaned;
	});
}

/**
 * Rewrites English Server/Client Component terms to lowercase Russian prose equivalents.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with Server/Client Component terminology localized in prose
 */
export function replaceEnglishServerClientComponentTerms(content: string) {
	return mapMarkdownProseRegions(content, (prose) => {
		let cleaned = applyReplacementsInMarkdownLinkLabels(
			prose,
			ENGLISH_SERVER_CLIENT_LINK_LABEL_REPLACEMENTS,
		);

		for (const [from, to] of RU_SERVER_CLIENT_PHRASE_REPLACEMENTS) {
			cleaned = cleaned.replaceAll(from, to);
		}

		for (const [pattern, replacement] of ENGLISH_SERVER_CLIENT_COMPONENT_REPLACEMENTS) {
			cleaned = cleaned.replace(pattern, replacement);
		}

		for (const [from, to] of RU_SERVER_CLIENT_POST_REPLACEMENTS) {
			cleaned = cleaned.replaceAll(from, to);
		}

		return cleaned;
	});
}

/**
 * Applies a curated whitelist of ё spellings outside fenced and inline code.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with validated ё forms restored
 */
export function applyCuratedRuYoSpellings(content: string) {
	return mapMarkdownProseRegions(content, (prose) => {
		let cleaned = prose;

		for (const [from, to] of RU_YO_SPELLING_REPLACEMENTS) {
			cleaned = cleaned.replace(cyrillicWordPattern(from), to);
		}

		return cleaned;
	});
}

/**
 * Applies Russian locale mechanical repairs validated on production translation feedback.
 *
 * @param content Assembled translated markdown
 *
 * @returns Document with Russian-specific LLM glitch patterns repaired
 */
export function applyRuLocaleMechanicalRepairs(content: string) {
	let cleaned = collapseDuplicatedRuUseClientLeadIn(content);
	cleaned = repairCorruptedRuOutputEmphasis(cleaned);
	cleaned = repairDuplicatedRuNegationEmphasis(cleaned);
	cleaned = repairRuRichTextEditorDependencyPhrase(cleaned);
	cleaned = replaceKnownRuCalquePhrases(cleaned);
	cleaned = replaceRuEnglishProseLeaks(cleaned);
	cleaned = replaceEnglishServerClientComponentTerms(cleaned);
	cleaned = applyCuratedRuYoSpellings(cleaned);

	return cleaned;
}
