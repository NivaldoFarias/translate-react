import { describe, expect, test } from "bun:test";

import {
	applyCuratedRuYoSpellings,
	applyRuLocaleMechanicalRepairs,
	collapseDuplicatedRuUseClientLeadIn,
	repairCorruptedRuOutputEmphasis,
	repairDuplicatedRuNegationEmphasis,
	repairRuCounterParentComponentPhrasing,
	repairRuFancyTextOutputPhrasing,
	repairRuReactServerComponentsAppCalques,
	repairRuRichTextEditorDependencyPhrase,
	repairRuUseClientDirectiveSuffixArtifacts,
	replaceEnglishServerClientComponentTerms,
	replaceKnownRuCalquePhrases,
	replaceRuEnglishProseLeaks,
} from "@/app/locales/ru/repairs";

describe("collapseDuplicatedRuUseClientLeadIn", () => {
	test("collapses duplicated Russian lead-in before a comma", () => {
		const input = "С помощью `'use client'` С помощью , вы можете определить";

		expect(collapseDuplicatedRuUseClientLeadIn(input)).toBe(
			"С помощью `'use client'`, вы можете определить",
		);
	});
});

describe("repairCorruptedRuOutputEmphasis", () => {
	test("restores dropped HTML output emphasis after a component reference", () => {
		const input = "в результате чего `FancyText` вывод _ (а не его исходный код) будет отправлен";

		expect(repairCorruptedRuOutputEmphasis(input)).toBe(
			"в результате чего `FancyText` HTML- _вывод_ (а не его исходный код) будет отправлен",
		);
	});

	test("removes duplicated corrupted output clause tails", () => {
		const input =
			"`FancyText` HTML- _вывод_ (а не его исходный код) будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, _ , а не его исходный код), будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, `FancyText` используется";

		expect(repairCorruptedRuOutputEmphasis(input)).toBe(
			"`FancyText` HTML- _вывод_ (а не его исходный код) будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, `FancyText` используется",
		);
	});
});

describe("repairDuplicatedRuNegationEmphasis", () => {
	test("collapses duplicated negation emphasis", () => {
		const input = "определение компонента не _не_ имеет `'use client'` директивы";

		expect(repairDuplicatedRuNegationEmphasis(input)).toBe(
			"определение компонента _не_ имеет `'use client'` директивы",
		);
	});
});

describe("repairRuRichTextEditorDependencyPhrase", () => {
	test("repairs RichTextEditor dependency phrasing from maintainer feedback", () => {
		const input =
			"В качестве зависимостей `RichTextEditor`, `formatDate` и `Button` также будут выполняться на клиенте.";

		expect(repairRuRichTextEditorDependencyPhrase(input)).toBe(
			"`formatDate` и `Button`, будучи зависимостями `RichTextEditor`, также будут выполняться на клиенте.",
		);
	});

	test("repairs alternate wrong dependency lead-ins", () => {
		const input =
			"Как зависимости `RichTextEditor`, `formatDate` и `Button` также будут вычисляться на клиенте.";

		expect(repairRuRichTextEditorDependencyPhrase(input)).toBe(
			"`formatDate` и `Button`, будучи зависимостями `RichTextEditor`, также будут вычисляться на клиенте.",
		);
	});

	test("inserts the participial comma before также", () => {
		const input =
			"`formatDate` и `Button`, будучи зависимостями `RichTextEditor` также будут вычислены на клиенте.";

		expect(repairRuRichTextEditorDependencyPhrase(input)).toBe(
			"`formatDate` и `Button`, будучи зависимостями `RichTextEditor`, также будут вычислены на клиенте.",
		);
	});
});

describe("repairRuUseClientDirectiveSuffixArtifacts", () => {
	test("rewrites directive suffix artifacts to natural Russian phrasing", () => {
		const input =
			"в модуле с `'use client'` -директивой, а определение _не_ имеет `'use client'` -директиву";

		expect(repairRuUseClientDirectiveSuffixArtifacts(input)).toBe(
			"в модуле с директивой `'use client'`, а определение _не_ имеет директиву `'use client'`",
		);
	});
});

describe("repairRuReactServerComponentsAppCalques", () => {
	test("repairs React Server Components app noun-stack calques", () => {
		const input =
			"рассмотрим следующее приложение серверные компоненты React и дерево зависимостей модулей приложения серверные компоненты React";

		expect(repairRuReactServerComponentsAppCalques(input)).toBe(
			"рассмотрим следующее приложение на серверных компонентах React и дерево зависимостей модулей приложения на серверных компонентах React",
		);
	});
});

describe("repairRuFancyTextOutputPhrasing", () => {
	test("repairs broken FancyText output tense from PR #1173 feedback", () => {
		const input =
			"что приводит к тому, что у `FancyText` появляется _вывод_ (а не его исходный код) отправлялся в браузер при обращении к нему из серверного компонента";

		expect(repairRuFancyTextOutputPhrasing(input)).toBe(
			"в результате чего при обращении из серверного компонента в браузер отправляется _вывод_ `FancyText` (а не его исходный код)",
		);
	});

	test("repairs HTML-output size wording", () => {
		const input = "если у `FancyText` вывод в HTML был большим по сравнению с исходным кодом";

		expect(repairRuFancyTextOutputPhrasing(input)).toBe(
			"если HTML-вывод `FancyText` велик по сравнению с его исходным кодом",
		);
	});
});

describe("repairRuCounterParentComponentPhrasing", () => {
	test("disambiguates Counter parent component phrasing", () => {
		const input =
			"Например, `Counter`, родительский компонент `CounterContainer`, не требует `'use client'`";

		expect(repairRuCounterParentComponentPhrasing(input)).toBe(
			"Например, родительский компонент `Counter` — `CounterContainer` — не требует `'use client'`",
		);
	});
});

describe("replaceKnownRuCalquePhrases", () => {
	test("localizes guillemet-wrapped component term", () => {
		expect(replaceKnownRuCalquePhrases("термин «component» не очень точен")).toBe(
			"термин «компонент» не очень точен",
		);
	});

	test("skips fenced code blocks", () => {
		const input =
			"```js\nconst Server Component = 1;\n```\nимпортированный из помеченного клиента кода";

		expect(replaceKnownRuCalquePhrases(input)).toBe(
			"```js\nconst Server Component = 1;\n```\nиз кода, помеченного как клиентский",
		);
	});
});

describe("replaceRuEnglishProseLeaks", () => {
	test("localizes common English loanword leaks in prose", () => {
		const input =
			"В React app фреймворк отрендерит root component через дерево render во время render.";

		expect(replaceRuEnglishProseLeaks(input)).toBe(
			"В приложении React фреймворк отрендерит корневой компонент через дерево рендеринга во время рендеринга.",
		);
	});
});

describe("replaceEnglishServerClientComponentTerms", () => {
	test("rewrites English Server/Client Component terms in prose", () => {
		const input =
			"импортируется из Server Component, а `App` считаются Server Components и Client Components.";

		expect(replaceEnglishServerClientComponentTerms(input)).toBe(
			"импортируется из серверного компонента, а `App` считаются серверными компонентами и клиентскими компонентами.",
		);
	});

	test("preserves inline code spans", () => {
		const input = "используйте `Server Component` в коде, но Server Component в prose.";

		expect(replaceEnglishServerClientComponentTerms(input)).toBe(
			"используйте `Server Component` в коде, но серверный компонент в prose.",
		);
	});

	test("localizes Server/Client terms inside markdown link labels", () => {
		const input =
			"используется с [React Server Components](/reference/rsc/server-components) и Server Component в prose.";

		expect(replaceEnglishServerClientComponentTerms(input)).toBe(
			"используется с [серверными компонентами React](/reference/rsc/server-components) и серверный компонент в prose.",
		);
	});

	test("fixes instrumental case after generic Server/Client swaps", () => {
		const input = "компонент одновременно является серверный компонент и клиентский компонент";

		expect(replaceEnglishServerClientComponentTerms(input)).toBe(
			"компонент одновременно является серверным компонентом и клиентским компонентом",
		);
	});
});

describe("applyCuratedRuYoSpellings", () => {
	test("restores reviewer-cited ё forms outside code", () => {
		const input = "желтый фон, объем текста и начнет рендер";

		expect(applyCuratedRuYoSpellings(input)).toBe("жёлтый фон, объём текста и начнёт рендер");
	});

	test("skips inline code", () => {
		const input = "`желтый` желтый";

		expect(applyCuratedRuYoSpellings(input)).toBe("`желтый` жёлтый");
	});
});

describe("applyRuLocaleMechanicalRepairs", () => {
	test("repairs smoke-style Russian regressions from run 29363105829", () => {
		const input = [
			"С помощью `'use client'` С помощью , вы можете определить",
			"в результате чего `FancyText` вывод _ (а не его исходный код) будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, _ , а не его исходный код), будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, `FancyText` используется",
		].join("\n");

		expect(applyRuLocaleMechanicalRepairs(input)).toBe(
			[
				"С помощью `'use client'`, вы можете определить",
				"в результате чего `FancyText` HTML- _вывод_ (а не его исходный код) будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, `FancyText` используется",
			].join("\n"),
		);
	});

	test("repairs use-client.md regressions from run 29429673894", () => {
		const input = [
			"В качестве зависимостей `RichTextEditor`, `formatDate` и `Button` также будут выполняться на клиенте.",
			"импортируется из Server Component, считаются Server Components.",
			"желтый фон в alt text",
			"определение компонента не _не_ имеет директивы",
		].join("\n");

		expect(applyRuLocaleMechanicalRepairs(input)).toBe(
			[
				"`formatDate` и `Button`, будучи зависимостями `RichTextEditor`, также будут выполняться на клиенте.",
				"импортируется из серверного компонента, считаются серверными компонентами.",
				"жёлтый фон в alt text",
				"определение компонента _не_ имеет директивы",
			].join("\n"),
		);
	});

	test("repairs PR #1173 review items from commit 4facfec", () => {
		const input = [
			"рассмотрим следующее приложение серверные компоненты React.",
			"в модуле с `'use client'` -директивой",
			"определение компонента _не_ имеет `'use client'` -директиву",
			"что приводит к тому, что у `FancyText` появляется _вывод_ (а не его исходный код) отправлялся в браузер при обращении к нему из серверного компонента",
			"если у `FancyText` вывод в HTML был большим по сравнению с исходным кодом",
			"Например, `Counter`, родительский компонент `CounterContainer`, не требует `'use client'`",
			"`formatDate` и `Button`, будучи зависимостями `RichTextEditor` также будут вычислены",
		].join("\n");

		expect(applyRuLocaleMechanicalRepairs(input)).toBe(
			[
				"рассмотрим следующее приложение на серверных компонентах React.",
				"в модуле с директивой `'use client'`",
				"определение компонента _не_ имеет директиву `'use client'`",
				"в результате чего при обращении из серверного компонента в браузер отправляется _вывод_ `FancyText` (а не его исходный код)",
				"если HTML-вывод `FancyText` велик по сравнению с его исходным кодом",
				"Например, родительский компонент `Counter` — `CounterContainer` — не требует `'use client'`",
				"`formatDate` и `Button`, будучи зависимостями `RichTextEditor`, также будут вычислены",
			].join("\n"),
		);
	});
});
