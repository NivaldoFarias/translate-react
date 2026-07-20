import type {
	LocalePhraseReplacementGroup,
	LocaleRegexRepair,
	LocaleServerClientTermReplacement,
} from "../../repairs/types";

/** Regex repairs for one-off Russian LLM glitches outside phrase tables */
export const ruRegexRepairs = [
	{
		id: "duplicatedUseClientLeadIn",
		description: "Collapses duplicated Russian lead-in before a comma after `'use client'`",
		scope: "document",
		pattern: /(С помощью\s+`'use client'`)\s+С помощью\s*,/g,
		replacement: "$1,",
	},
	{
		id: "corruptedOutputClauseDuplicate",
		description: "Removes duplicated trailing clause after partial `_output_` emphasis repair",
		scope: "document",
		pattern:
			/, _ , а не его исходный код\), будет отправлен в браузер при обращении из серверного компонента\. Как показано в предыдущем примере приложения Inspirations,/g,
		replacement: ",",
	},
	{
		id: "droppedOutputEmphasisAfterComponent",
		description: "Restores dropped `_вывод_` emphasis after a component reference",
		scope: "document",
		pattern: /(`\w+`)\s+вывод\s+_\s+\(/g,
		replacement: "$1 HTML- _вывод_ (",
	},
	{
		id: "duplicatedNegationEmphasis",
		description: "Collapses duplicated negation emphasis glitches such as `не _не_`",
		scope: "document",
		pattern: /не _не_/gu,
		replacement: "_не_",
	},
	{
		id: "richTextEditorDependencyList",
		description:
			"Repairs inverted RichTextEditor dependency list phrasing from maintainer feedback",
		scope: "outside-fences",
		pattern:
			/(?:В качестве зависимостей|Будучи зависимостями|Как зависимости)\s+`RichTextEditor`,\s*`formatDate`\s+и\s+`Button`/gu,
		replacement: "`formatDate` и `Button`, будучи зависимостями `RichTextEditor`",
	},
	{
		id: "richTextEditorMissingComma",
		description: "Inserts the closing comma after a participial RichTextEditor dependency clause",
		scope: "outside-fences",
		pattern: /(`formatDate` и `Button`, будучи зависимостями `RichTextEditor`) также/gu,
		replacement: "$1, также",
	},
	{
		id: "useClientDirectiveSuffixDative",
		description: "Rewrites `'use client' -директиву` to natural Russian directive phrasing",
		scope: "document",
		pattern: /`'use client'` -директиву/gu,
		replacement: "директиву `'use client'`",
	},
	{
		id: "useClientDirectiveSuffixInstrumental",
		description: "Rewrites `'use client' -директивой` to natural Russian directive phrasing",
		scope: "document",
		pattern: /`'use client'` -директивой/gu,
		replacement: "директивой `'use client'`",
	},
	{
		id: "counterParentComponentPhrasing",
		description: "Disambiguates parent/child component phrasing for Counter and CounterContainer",
		scope: "document",
		pattern: /Например,\s*`Counter`,\s*родительский компонент\s*`CounterContainer`,\s*не требует/gu,
		replacement: "Например, родительский компонент `Counter` — `CounterContainer` — не требует",
	},
] as const satisfies readonly LocaleRegexRepair[];

/** Literal phrase replacement tables grouped by maintainer feedback theme */
export const ruPhraseReplacementGroups = [
	{
		id: "calques",
		description: "Prod-validated Russian calque replacements from maintainer review feedback",
		replacements: [
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
		],
	},
	{
		id: "englishProseLeaks",
		description: "English loanword leaks in otherwise Russian prose",
		replacements: [
			["В React app", "В приложении React"],
			["root component", "корневой компонент"],
			["React app", "приложение React"],
			["дерево render", "дерево рендеринга"],
			["дереву render", "дереву рендеринга"],
			["во время render", "во время рендеринга"],
			["Во время render", "Во время рендеринга"],
			["componente", "компонент"],
		],
	},
	{
		id: "rscAppCalques",
		description:
			"Repairs dative React Server Components app calques after generic Server/Client swaps",
		replacements: [
			["приложение серверные компоненты React", "приложение на серверных компонентах React"],
			["приложения серверные компоненты React", "приложения на серверных компонентах React"],
			[
				"Дерево рендеринга для приложения серверные компоненты React",
				"Дерево рендеринга для приложения на серверных компонентах React",
			],
			[
				"разделяет дерево зависимостей модулей приложения серверные компоненты React",
				"разделяет дерево зависимостей модулей приложения на серверных компонентах React",
			],
			[
				"рассмотрим следующее приложение серверные компоненты React",
				"рассмотрим следующее приложение на серверных компонентах React",
			],
		],
	},
	{
		id: "fancyTextOutputPhrasing",
		description: "Repairs broken FancyText output tense and HTML-output wording from PR #1173",
		replacements: [
			[
				"что приводит к тому, что у `FancyText` появляется _вывод_ (а не его исходный код) отправлялся в браузер при обращении к нему из серверного компонента",
				"в результате чего при обращении из серверного компонента в браузер отправляется _вывод_ `FancyText` (а не его исходный код)",
			],
			[
				"если у `FancyText` вывод в HTML был большим по сравнению с исходным кодом",
				"если HTML-вывод `FancyText` велик по сравнению с его исходным кодом",
			],
		],
	},
	{
		id: "yoSpellings",
		description: "Curated ё spellings validated on production Russian translation feedback",
		replacements: [
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
		],
	},
	{
		id: "serverClientPhrases",
		description: "Phrase-level Server/Client fixes before generic term swaps",
		replacements: [
			["импортируется из Server Component", "импортируется из серверного компонента"],
			["считаются Server Components", "считаются серверными компонентами"],
			["являются Server Components", "являются серверными компонентами"],
			["являются Client Components", "являются клиентскими компонентами"],
			["использование является Client Component", "использование является клиентским компонентом"],
			["использование является Server Component", "использование является серверным компонентом"],
			[
				"элементами Client или Server Component",
				"элементами клиентского или серверного компонента",
			],
			[
				"как Server Component, и как Client Component",
				"как серверный компонент, и как клиентский компонент",
			],
		],
	},
	{
		id: "serverClientPostFixes",
		description: "Instrumental-case and agreement fixes after generic Server/Client term swaps",
		replacements: [
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
			[
				"использование является клиентский компонент",
				"использование является клиентским компонентом",
			],
			[
				"использование является серверный компонент",
				"использование является серверным компонентом",
			],
			["с [серверные компоненты React]", "с [серверными компонентами React]"],
			["с [Серверные компоненты React]", "с [серверными компонентами React]"],
		],
	},
] as const satisfies readonly LocalePhraseReplacementGroup[];

/** English Server/Client Component product terms left in Russian prose */
export const ruEnglishServerClientComponentReplacements = [
	[/React Server Components/gu, "серверные компоненты React"],
	[/Server Components/gu, "серверные компоненты"],
	[/Client Components/gu, "клиентские компоненты"],
	[/Client or Server Component/gu, "клиентский или серверный компонент"],
	[/Server Component/gu, "серверный компонент"],
	[/Client Component/gu, "клиентский компонент"],
] as const satisfies readonly LocaleServerClientTermReplacement[];

/** Link-label replacements for Server/Client product terms */
export const ruEnglishServerClientLinkLabelReplacements = [
	[/React Server Components/gu, "серверные компоненты React"],
	[/Server Components/gu, "серверные компоненты"],
	[/Client Components/gu, "клиентские компоненты"],
	[/Server Component/gu, "серверный компонент"],
	[/Client Component/gu, "клиентский компонент"],
] as const satisfies readonly LocaleServerClientTermReplacement[];
