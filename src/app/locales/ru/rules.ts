import type { LocalePromptRuleSection } from "../rules.util";

import { buildLocaleRulesPrompt, segmentBatchContextSection } from "../rules.util";

const ruDeprecatedRulesSection: LocalePromptRuleSection = {
	bullets: [
		"ALWAYS translate 'deprecated' and related terms (deprecation, deprecating, deprecates) to 'устаревший', 'устаревшее', 'устаревшая' or appropriate forms in ALL contexts (documentation text, comments, headings, lists, etc.)",
		"Exception: Do NOT translate 'deprecated' in HTML comment IDs like {/*deprecated-something*/} - keep these exactly as-is",
		"Exception: Do NOT translate 'deprecated' in URLs, anchor links, or code variable names",
	],
};

const ruMdnUrlRulesSection: LocalePromptRuleSection = {
	bullets: [
		"When a MDN document is referenced, update the language slug to the Russian version for that specific page ('https://developer.mozilla.org/en-US/docs/...' => 'https://developer.mozilla.org/ru/docs/...'), including built-in type references such as String, Array, Map, Set, Date, and Promise",
	],
};

const ruStyleRulesSection: LocalePromptRuleSection = {
	bullets: [
		'Use formal "вы" (not informal "ты") when addressing the reader',
		"Loanwords such as hook, props, and state may stay in English when they name a React API concept, but translate compound prose phrases into Russian (render tree -> дерево рендеринга, root component -> корневой компонент, React app -> приложение React); do not leave isolated English nouns like app, render, or component in otherwise Russian sentences",
		"ALWAYS use the letter 'ё' where standard Russian spelling requires it (e.g. 'определён', 'объём', 'жёлтый', 'начнёт'), not the substitute 'е'",
		'ALWAYS use Russian guillemets («») for quotation marks, never straight double quotes (")',
		"Translate 'bundler' as 'бандлер', not 'сборщик'",
		"Use lowercase for 'серверные компоненты' (Server Components) and 'клиентские компоненты' (Client Components), consistent with other compound terms like 'дочерний компонент' and 'классовый компонент'; do not capitalize each word or use 'Компонент Сервера' / 'Компонент Клиента'",
		"Translate 'Server Component(s)' and 'Client Component(s)' in prose as 'серверный компонент' / 'серверные компоненты' and 'клиентский компонент' / 'клиентские компоненты'; do not leave the English product terms in Russian sentences",
		"After translating Server Component / Client Component terms, use correct Russian case (instrumental after 'является': 'является серверным компонентом', not 'является серверный компонент')",
		"Translate 'React Server Components app' as 'приложение на серверных компонентах React', not a literal noun stack like 'приложение серверные компоненты React'",
		"Refer to `'use client'` with natural Russian grammar such as 'директиву `'use client'`' or 'с директивой `'use client'`'; never append a hyphenated suffix like `'use client' -директиву`",
		"Do not insert a space before punctuation that immediately follows inline code or markdown links (write `canvas`. and [DOM API], not `canvas` . or [DOM API] ,)",
	],
};

const ruSemanticRulesSection: LocalePromptRuleSection = {
	heading: "SEMANTIC TRANSLATION (avoid calques)",
	bullets: [
		"Translate 'null prototype' as 'прототип null' or 'прототипом null', not 'нулевой прототип' or 'нулевого прототипа' (zero prototype is a different concept)",
		"Translate 'client-marked code' with natural Russian grammar, e.g. 'код, помеченный как клиентский' or 'из кода, помеченного как клиентский', not broken phrases like 'импортированный из помеченного клиента кода'",
		"Avoid calques for 'may experience low latency'; prefer natural phrasing about lower latency for data retrieval and network requests, not 'могут испытывать низкую задержку'",
		"Avoid calques for 'agnostic about where they render'; prefer 'не зависят от того, где они рендерятся', not 'могут быть агностиками к тому, где они рендерятся'",
		"Translate 'as Server Components are default' as 'по умолчанию компоненты являются серверными', not 'Компоненты Сервера являются стандартными'",
		"In diagram or illustration alt text, translate 'tree graph' as 'древовидный граф' or 'дерево', not 'график дерева' (график implies a chart or plot)",
		"When English says 'As dependencies of ComponentA, depB and depC', preserve that depB and depC are dependencies of ComponentA, not three parallel list items",
		"English 'As dependencies of `RichTextEditor`, `formatDate` and `Button`' must name only `formatDate` and `Button` as dependencies of `RichTextEditor`, e.g. '`formatDate` и `Button`, будучи зависимостями `RichTextEditor`, также будут ...' (include the comma after the participial clause)",
		"For `Counter`'s parent component, `CounterContainer`, write 'родительский компонент `Counter` — `CounterContainer` —', not '`Counter`, родительский компонент `CounterContainer`'",
		"For FancyText output sent from a server component, prefer 'в результате чего при обращении из серверного компонента в браузер отправляется _вывод_ `FancyText` (а не его исходный код)', not mixed tense such as 'появляется _вывод_ ... отправлялся'",
		"Translate 'if FancyText's HTML output was large compared to its source code' as 'если HTML-вывод `FancyText` велик по сравнению с его исходным кодом', not 'вывод в HTML был большим'",
	],
};

const ruFullDocumentSections = [
	ruDeprecatedRulesSection,
	ruMdnUrlRulesSection,
	ruStyleRulesSection,
	ruSemanticRulesSection,
] as const satisfies readonly LocalePromptRuleSection[];

const ruSegmentDocumentSections = [
	segmentBatchContextSection,
	ruDeprecatedRulesSection,
	ruStyleRulesSection,
	ruSemanticRulesSection,
] as const satisfies readonly LocalePromptRuleSection[];

/** Full-document Russian locale rules appended to legacy body prompts */
export const ruSpecificRules = buildLocaleRulesPrompt(
	"RUSSIAN SPECIFIC RULES",
	ruFullDocumentSections,
);

/** Segment and frontmatter batch rules for Russian locale prompts */
export const ruSegmentSpecificRules = buildLocaleRulesPrompt(
	"RUSSIAN SPECIFIC RULES",
	ruSegmentDocumentSections,
);
